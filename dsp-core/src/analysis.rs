//! Song analysis on a short-time Fourier transform (rustfft): tempo and beat phase, key, and a
//! quick split into percussive, bass and harmonic parts. Plain DSP, no machine learning.

use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::collections::VecDeque;
use std::sync::Arc;

pub const FRAME: usize = 2048;
pub const HOP: usize = 512;

fn hann(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos())
        .collect()
}

/// Forward STFT of a signal padded with one frame of silence at each end.
struct Stft {
    fft: Arc<dyn Fft<f32>>,
    win: Vec<f32>,
    padded: Vec<f32>,
    frame: usize,
    hop: usize,
}

impl Stft {
    fn new(x: &[f32]) -> Self {
        Self::with_frame(x, FRAME, HOP)
    }
    fn with_frame(x: &[f32], frame: usize, hop: usize) -> Self {
        let mut padded = vec![0.0; frame];
        padded.extend_from_slice(x);
        padded.extend(std::iter::repeat(0.0).take(frame * 2));
        Stft { fft: FftPlanner::new().plan_fft_forward(frame), win: hann(frame), padded, frame, hop }
    }
    fn frames(&self) -> usize {
        (self.padded.len() - self.frame) / self.hop
    }
    fn spectrum(&self, t: usize) -> Vec<Complex<f32>> {
        let mut buf: Vec<Complex<f32>> = (0..self.frame)
            .map(|i| Complex::new(self.padded[t * self.hop + i] * self.win[i], 0.0))
            .collect();
        self.fft.process(&mut buf);
        buf
    }
}

/// Onset strength per frame: the rise in log-magnitude, summed over bins, with the local mean removed.
fn onset_envelope(x: &[f32]) -> Vec<f32> {
    let stft = Stft::new(x);
    let bins = FRAME / 2;
    let mut prev = vec![0.0f32; bins];
    let mut env = Vec::with_capacity(stft.frames());
    for t in 0..stft.frames() {
        let spec = stft.spectrum(t);
        let mut flux = 0.0;
        for b in 0..bins {
            let m = (1.0 + 100.0 * spec[b].norm()).ln();
            flux += (m - prev[b]).max(0.0);
            prev[b] = m;
        }
        env.push(flux);
    }
    let half = 43; // about half a second each side
    let mut out = vec![0.0; env.len()];
    for t in 0..env.len() {
        let lo = t.saturating_sub(half);
        let hi = (t + half + 1).min(env.len());
        let mean = env[lo..hi].iter().sum::<f32>() / (hi - lo) as f32;
        out[t] = (env[t] - mean).max(0.0);
    }
    out
}

/// Tempo in BPM (60..200, biased towards 120) and the time of the first beat in seconds.
/// Returns `[0, 0]` when there is nothing rhythmic to find. Which beat is "one" is not known.
pub fn detect_tempo(x: &[f32], sample_rate: f32) -> [f32; 2] {
    let env = onset_envelope(x);
    let fps = sample_rate / HOP as f32;
    let (lo, hi) = ((fps * 60.0 / 200.0) as usize, (fps * 60.0 / 60.0) as usize + 1);
    if env.len() < hi * 3 || env.iter().all(|&v| v == 0.0) {
        return [0.0, 0.0];
    }
    let ac = |lag: usize| -> f32 { env[lag..].iter().zip(env.iter()).map(|(a, b)| a * b).sum::<f32>() / (env.len() - lag) as f32 };
    let scores: Vec<f32> = (0..=hi + 1).map(|l| if l + 1 >= lo { ac(l) } else { 0.0 }).collect();
    let mut best = (lo, f32::MIN);
    for lag in lo..=hi {
        let bpm = 60.0 * fps / lag as f32;
        let prior = (-0.5 * (bpm / 120.0).log2().powi(2)).exp();
        let s = scores[lag] * prior;
        if s > best.1 {
            best = (lag, s);
        }
    }
    if best.1 <= 0.0 {
        return [0.0, 0.0];
    }
    // Parabolic refinement between frames.
    let (a, b, c) = (scores[best.0 - 1], scores[best.0], scores[best.0 + 1]);
    let denom = a - 2.0 * b + c;
    let period = best.0 as f32 + if denom.abs() > 1e-12 { 0.5 * (a - c) / denom } else { 0.0 };
    // Beat phase: the offset whose comb of beats collects the most onset strength.
    let mut phase = (0usize, f32::MIN);
    for o in 0..period.ceil() as usize {
        let mut s = 0.0;
        let mut k = 0.0f32;
        while ((o as f32 + k * period) as usize) < env.len() {
            s += env[(o as f32 + k * period) as usize];
            k += 1.0;
        }
        if s > phase.1 {
            phase = (o, s);
        }
    }
    // Frame t ends at sample t*HOP of the original; an onset shows up as it enters the window.
    let first = ((phase.0 * HOP) as f32 - FRAME as f32 / 4.0).max(0.0) / sample_rate;
    [60.0 * fps / period, first]
}

const MAJOR: [f32; 12] = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR: [f32; 12] = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

fn correlate(a: &[f32; 12], b: &[f32; 12], shift: usize) -> f32 {
    let (ma, mb) = (a.iter().sum::<f32>() / 12.0, b.iter().sum::<f32>() / 12.0);
    let (mut n, mut da, mut db) = (0.0, 0.0, 0.0);
    for i in 0..12 {
        let (x, y) = (a[(i + shift) % 12] - ma, b[i] - mb);
        n += x * y;
        da += x * x;
        db += y * y;
    }
    if da * db > 0.0 { n / (da * db).sqrt() } else { 0.0 }
}

/// Key estimate from a chroma histogram against the Krumhansl profiles.
/// 0..11 is C..B major, 12..23 is C..B minor, -1 is "no pitched content".
pub fn detect_key(x: &[f32], sample_rate: f32) -> i32 {
    let stft = Stft::new(x);
    let mut chroma = [0.0f32; 12];
    for t in (0..stft.frames()).step_by(4) {
        let spec = stft.spectrum(t);
        for b in 1..FRAME / 2 {
            let f = b as f32 * sample_rate / FRAME as f32;
            if !(65.0..2000.0).contains(&f) {
                continue;
            }
            let pc = (12.0 * (f / 261.63).log2()).round().rem_euclid(12.0) as usize;
            chroma[pc] += spec[b].norm_sqr();
        }
    }
    if chroma.iter().sum::<f32>() <= 1e-9 {
        return -1;
    }
    for c in chroma.iter_mut() {
        *c = c.sqrt();
    }
    let mut best = (-1, f32::MIN);
    for k in 0..12 {
        for (mode, profile) in [(0, &MAJOR), (12, &MINOR)] {
            let r = correlate(&chroma, profile, k);
            if r > best.1 {
                best = (k as i32 + mode, r);
            }
        }
    }
    best.0
}

/// Chroma (12 pitch classes, C first) of one stretch of samples, energy-summed over frames.
fn chroma_of(x: &[f32], sample_rate: f32) -> [f32; 12] {
    // A long frame (5 Hz bins at 44.1 kHz) so neighbouring semitones near the low E stay apart.
    const CHROMA_FRAME: usize = 8192;
    let stft = Stft::with_frame(x, CHROMA_FRAME, CHROMA_FRAME / 2);
    let mut chroma = [0.0f32; 12];
    for t in 0..stft.frames() {
        let spec = stft.spectrum(t);
        for b in 1..CHROMA_FRAME / 2 {
            let f = b as f32 * sample_rate / CHROMA_FRAME as f32;
            if !(65.0..2000.0).contains(&f) {
                continue;
            }
            let pc = (12.0 * (f / 261.63).log2()).round().rem_euclid(12.0) as usize;
            chroma[pc] += spec[b].norm_sqr();
        }
    }
    chroma
}

/// One chord per bar, matched against major and minor triad templates on the bar's chroma:
/// 0..11 C..B major, 12..23 C..B minor, -1 when the bar is too quiet to say.
pub fn detect_chords(x: &[f32], sample_rate: f32, bpm: f32, downbeat: f32, beats_per_bar: usize) -> Vec<i32> {
    if !(bpm > 0.0) || beats_per_bar == 0 || x.is_empty() {
        return Vec::new();
    }
    let bar = (60.0 / bpm) * beats_per_bar as f32 * sample_rate;
    let first = (downbeat * sample_rate).max(0.0);
    let bars = ((x.len() as f32 - first) / bar).ceil().max(0.0) as usize;
    let mut chromas: Vec<[f32; 12]> = Vec::with_capacity(bars);
    for k in 0..bars {
        let a = (first + k as f32 * bar) as usize;
        let b = ((first + (k + 1) as f32 * bar) as usize).min(x.len());
        chromas.push(if b > a { chroma_of(&x[a..b], sample_rate) } else { [0.0; 12] });
    }
    // A bar counts as pitched when it holds at least 5% of the loudest bar's energy.
    let loudest = chromas.iter().map(|c| c.iter().sum::<f32>()).fold(0.0f32, f32::max);
    chromas
        .iter()
        .map(|c| {
            let total: f32 = c.iter().sum();
            if total <= 1e-9 || total < loudest * 0.05 {
                return -1;
            }
            let mut best = (-1, f32::MIN);
            for root in 0..12 {
                for (mode, third) in [(0, 4), (12, 3)] {
                    let tri = [root, (root + third) % 12, (root + 7) % 12];
                    let inside: f32 = tri.iter().map(|&p| c[p].sqrt()).sum();
                    let outside: f32 = (0..12).filter(|p| !tri.contains(p)).map(|p| c[p].sqrt()).sum();
                    let score = inside - outside * 0.5;
                    if score > best.1 {
                        best = (root as i32 + mode, score);
                    }
                }
            }
            best.0
        })
        .collect()
}

/// Fundamental frequency of a short window (YIN, 50..1200 Hz), or 0 when nothing periodic is heard.
pub fn detect_pitch(x: &[f32], sample_rate: f32) -> f32 {
    let n = x.len();
    let max_tau = (sample_rate / 50.0) as usize;
    let min_tau = (sample_rate / 1200.0).max(2.0) as usize;
    if n < max_tau * 2 || max_tau <= min_tau {
        return 0.0;
    }
    let rms = (x.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
    if rms < 0.005 {
        return 0.0;
    }
    let w = n - max_tau;
    let mut d = vec![0.0f32; max_tau + 1];
    for tau in 1..=max_tau {
        let mut s = 0.0f32;
        for i in 0..w {
            let e = x[i] - x[i + tau];
            s += e * e;
        }
        d[tau] = s;
    }
    // Cumulative mean normalised difference.
    let mut cmnd = vec![1.0f32; max_tau + 1];
    let mut run = 0.0f32;
    for tau in 1..=max_tau {
        run += d[tau];
        cmnd[tau] = if run > 0.0 { d[tau] * tau as f32 / run } else { 1.0 };
    }
    let mut tau = min_tau;
    let mut found = None;
    while tau < max_tau {
        if cmnd[tau] < 0.15 {
            while tau + 1 < max_tau && cmnd[tau + 1] < cmnd[tau] {
                tau += 1;
            }
            found = Some(tau);
            break;
        }
        tau += 1;
    }
    let Some(t) = found else { return 0.0 };
    let (a, b, c) = (cmnd[t - 1], cmnd[t], cmnd[t + 1]);
    let denom = a - 2.0 * b + c;
    let refined = t as f32 + if denom.abs() > 1e-12 { 0.5 * (a - c) / denom } else { 0.0 };
    sample_rate / refined
}

fn median(v: &mut [f32]) -> f32 {
    let mid = v.len() / 2;
    *v.select_nth_unstable_by(mid, |a, b| a.total_cmp(b)).1
}

/// Quick split by median filtering the spectrogram (harmonic/percussive separation): sounds that
/// are steady in time are harmonic, sounds that are broad in frequency are percussive. Harmonic
/// content below `bass_hz` goes to the bass part. Returns `[percussive | bass | harmonic]`, each
/// `x.len()` long. The three masks sum to one, so the parts add back up to the original.
pub fn quick_split(x: &[f32], sample_rate: f32, bass_hz: f32) -> Vec<f32> {
    const R: usize = 8; // median reach: 17 frames in time, 17 bins in frequency
    let n = x.len();
    let stft = Stft::new(x);
    let frames = stft.frames();
    let inverse = FftPlanner::new().plan_fft_inverse(FRAME);
    let win = hann(FRAME);
    let bass_bin = (bass_hz * FRAME as f32 / sample_rate) as usize;
    let half = FRAME / 2;
    let total = stft.padded.len();
    let mut outs = [vec![0.0f32; total], vec![0.0f32; total], vec![0.0f32; total]];
    let mut wsum = vec![0.0f32; total];
    let mut ring: VecDeque<(usize, Vec<Complex<f32>>, Vec<f32>)> = VecDeque::new();
    let mut next = 0;
    let mut col = [0.0f32; 2 * R + 1];
    let mut h = vec![0.0f32; half + 1];
    let mut p = vec![0.0f32; half + 1];
    for c in 0..frames {
        while next < frames && next <= c + R {
            let spec = stft.spectrum(next);
            let mags = spec[..=half].iter().map(|z| z.norm()).collect();
            ring.push_back((next, spec, mags));
            next += 1;
        }
        while ring.front().map_or(false, |f| f.0 + R < c) {
            ring.pop_front();
        }
        let centre = ring.iter().position(|f| f.0 == c).unwrap();
        for b in 0..=half {
            let mut k = 0;
            for f in ring.iter() {
                col[k] = f.2[b];
                k += 1;
            }
            h[b] = median(&mut col[..k]);
            let (lo, hi) = (b.saturating_sub(R), (b + R).min(half));
            let m = &ring[centre].2;
            let w = hi - lo + 1;
            col[..w].copy_from_slice(&m[lo..=hi]);
            p[b] = median(&mut col[..w]);
        }
        let spec = &ring[centre].1;
        for (part, out) in outs.iter_mut().enumerate() {
            let mut buf = vec![Complex::new(0.0f32, 0.0); FRAME];
            for b in 0..=half {
                let (h2, p2) = (h[b] * h[b], p[b] * p[b]);
                let mh = if h2 + p2 > 0.0 { h2 / (h2 + p2) } else { 0.5 };
                let mask = match part {
                    0 => 1.0 - mh,
                    1 => if b <= bass_bin { mh } else { 0.0 },
                    _ => if b <= bass_bin { 0.0 } else { mh },
                };
                buf[b] = spec[b] * mask;
                if b > 0 && b < half {
                    buf[FRAME - b] = spec[FRAME - b] * mask;
                }
            }
            inverse.process(&mut buf);
            for i in 0..FRAME {
                out[c * HOP + i] += buf[i].re / FRAME as f32 * win[i];
            }
        }
        for i in 0..FRAME {
            wsum[c * HOP + i] += win[i] * win[i];
        }
    }
    let mut result = Vec::with_capacity(n * 3);
    for out in outs.iter() {
        result.extend((0..n).map(|i| {
            let w = wsum[FRAME + i];
            if w > 1e-6 { out[FRAME + i] / w } else { 0.0 }
        }));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    const SR: f32 = 44100.0;

    fn tone(freq: f32, secs: f32, amp: f32) -> Vec<f32> {
        (0..(SR * secs) as usize).map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / SR).sin() * amp).collect()
    }

    /// Short noise bursts on every beat, the first at `first` seconds.
    fn clicks(bpm: f32, secs: f32, first: f32) -> Vec<f32> {
        let mut x = vec![0.0f32; (SR * secs) as usize];
        let mut seed = 12345u32;
        let mut t = first;
        while t < secs - 0.1 {
            let at = (t * SR) as usize;
            for i in 0..400 {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                x[at + i] = ((seed >> 8) as f32 / (1 << 24) as f32 - 0.5) * (1.0 - i as f32 / 400.0);
            }
            t += 60.0 / bpm;
        }
        x
    }

    #[test]
    fn finds_tempo_and_first_beat() {
        for bpm in [90.0, 100.0, 128.0] {
            let [found, first] = detect_tempo(&clicks(bpm, 20.0, 0.25), SR);
            assert!((found - bpm).abs() < 1.0, "{bpm}: got {found}");
            let beat = 60.0 / bpm;
            let err = ((first - 0.25) / beat - ((first - 0.25) / beat).round()).abs() * beat;
            assert!(err < 0.04, "{bpm}: first beat {first}");
        }
    }

    #[test]
    fn silence_has_no_tempo_or_key() {
        let x = vec![0.0; 44100 * 5];
        assert_eq!(detect_tempo(&x, SR), [0.0, 0.0]);
        assert_eq!(detect_key(&x, SR), -1);
    }

    #[test]
    fn finds_a_minor_and_c_major() {
        let chord = |notes: &[(f32, f32)]| {
            let mut x = vec![0.0; (SR * 3.0) as usize];
            for &(f, a) in notes {
                for (o, s) in x.iter_mut().zip(tone(f, 3.0, a)) {
                    *o += s;
                }
            }
            x
        };
        // Scale notes weighted towards the tonic triad.
        let a_minor = chord(&[(220.0, 0.3), (261.63, 0.2), (329.63, 0.25), (246.94, 0.05), (293.66, 0.08), (349.23, 0.05), (392.0, 0.08)]);
        assert_eq!(detect_key(&a_minor, SR), 12 + 9);
        let c_major = chord(&[(261.63, 0.3), (329.63, 0.2), (392.0, 0.25), (293.66, 0.06), (349.23, 0.08), (440.0, 0.06), (493.88, 0.04)]);
        assert_eq!(detect_key(&c_major, SR), 0);
    }

    #[test]
    fn chords_per_bar_follow_a_progression() {
        // Four bars at 120 BPM in 4/4 (2 s each): Am, C, G, Em.
        let triads: [&[f32]; 4] = [&[220.0, 261.63, 329.63], &[261.63, 329.63, 392.0], &[196.0, 246.94, 293.66], &[164.81, 196.0, 246.94]];
        let mut x = Vec::new();
        for t in triads {
            let mut bar = vec![0.0f32; (SR * 2.0) as usize];
            for &f in t {
                for (o, s) in bar.iter_mut().zip(tone(f, 2.0, 0.2)) {
                    *o += s;
                }
            }
            x.extend(bar);
        }
        assert_eq!(detect_chords(&x, SR, 120.0, 0.0, 4), vec![12 + 9, 0, 7, 12 + 4]);
        // A silent bar reads as none, and a missing tempo gives nothing.
        x.extend(vec![0.0f32; (SR * 2.0) as usize]);
        assert_eq!(detect_chords(&x, SR, 120.0, 0.0, 4).last(), Some(&-1));
        assert!(detect_chords(&x, SR, 0.0, 0.0, 4).is_empty());
    }

    #[test]
    fn pitch_of_guitar_strings_and_silence() {
        for f in [82.41, 110.0, 146.83, 196.0, 246.94, 329.63, 440.0] {
            let mut x = tone(f, 0.1, 0.3);
            // Add a couple of harmonics so it looks like a plucked string, not a sine.
            for (i, v) in x.iter_mut().enumerate() {
                let t = i as f32 / SR;
                *v += 0.15 * (2.0 * std::f32::consts::PI * 2.0 * f * t).sin() + 0.08 * (2.0 * std::f32::consts::PI * 3.0 * f * t).sin();
            }
            let got = detect_pitch(&x[..4096], SR);
            assert!((got - f).abs() / f < 0.01, "{f}: got {got}");
        }
        assert_eq!(detect_pitch(&vec![0.0; 4096], SR), 0.0);
        assert_eq!(detect_pitch(&tone(440.0, 0.01, 0.3), SR), 0.0);
    }

    #[test]
    fn split_separates_clicks_from_a_tone_and_adds_back_up() {
        let t = tone(440.0, 4.0, 0.3);
        let c = clicks(120.0, 4.0, 0.2);
        let x: Vec<f32> = t.iter().zip(&c).map(|(a, b)| a + b).collect();
        let n = x.len();
        let parts = quick_split(&x, SR, 200.0);
        let (perc, bass, harm) = (&parts[..n], &parts[n..2 * n], &parts[2 * n..]);
        let energy = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        // The tone lands mostly in the harmonic part, the clicks mostly in the percussive part.
        assert!(energy(harm, &t) > 5.0 * energy(perc, &t).abs(), "tone leaked");
        assert!(energy(perc, &c) > 2.0 * energy(harm, &c).abs(), "clicks leaked");
        let worst = (2048..n - 2048).map(|i| (perc[i] + bass[i] + harm[i] - x[i]).abs()).fold(0.0f32, f32::max);
        assert!(worst < 1e-3, "parts do not add back up: {worst}");
    }

    #[test]
    fn low_tone_goes_to_the_bass_part() {
        let x = tone(80.0, 3.0, 0.4);
        let n = x.len();
        let parts = quick_split(&x, SR, 200.0);
        let rms = |a: &[f32]| (a.iter().map(|v| v * v).sum::<f32>() / a.len() as f32).sqrt();
        assert!(rms(&parts[n..2 * n]) > 10.0 * rms(&parts[2 * n..]));
    }
}
