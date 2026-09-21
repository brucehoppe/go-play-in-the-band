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
}

impl Stft {
    fn new(x: &[f32]) -> Self {
        let mut padded = vec![0.0; FRAME];
        padded.extend_from_slice(x);
        padded.extend(std::iter::repeat(0.0).take(FRAME * 2));
        Stft { fft: FftPlanner::new().plan_fft_forward(FRAME), win: hann(FRAME), padded }
    }
    fn frames(&self) -> usize {
        (self.padded.len() - FRAME) / HOP
    }
    fn spectrum(&self, t: usize) -> Vec<Complex<f32>> {
        let mut buf: Vec<Complex<f32>> = (0..FRAME)
            .map(|i| Complex::new(self.padded[t * HOP + i] * self.win[i], 0.0))
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
