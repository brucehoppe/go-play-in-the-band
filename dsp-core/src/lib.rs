//! DSP core for Go Play in the Band. Compiled to WASM for the browser and tested natively.

/// Sample range covered by bucket `b` when `n` samples are split into `buckets`.
/// Uses u64 because `b * n` overflows a 32-bit usize (wasm32) for long files.
fn bucket_range(b: usize, n: usize, buckets: usize) -> (usize, usize) {
    let start = (b as u64 * n as u64 / buckets as u64) as usize;
    let end = ((b as u64 + 1) * n as u64 / buckets as u64) as usize;
    (start, end.max(start + 1).min(n))
}

/// Min and max of each bucket: `[min0, max0, min1, max1, ...]`, length `2 * buckets`.
pub fn compute_peaks(samples: &[f32], buckets: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; buckets * 2];
    if samples.is_empty() || buckets == 0 {
        return out;
    }
    for b in 0..buckets {
        let (start, end) = bucket_range(b, samples.len(), buckets);
        let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
        for &s in &samples[start..end] {
            if s < lo {
                lo = s;
            }
            if s > hi {
                hi = s;
            }
        }
        out[2 * b] = lo;
        out[2 * b + 1] = hi;
    }
    out
}

pub mod analysis;

use wasm_bindgen::prelude::*;

/// Browser entry point: `peaks(Float32Array, buckets) -> Float32Array`.
#[wasm_bindgen]
pub fn peaks(samples: &[f32], buckets: u32) -> Vec<f32> {
    compute_peaks(samples, buckets as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_gives_zeros() {
        assert_eq!(compute_peaks(&[], 3), vec![0.0; 6]);
    }

    #[test]
    fn zero_buckets_gives_empty() {
        assert!(compute_peaks(&[0.5, -0.5], 0).is_empty());
    }

    #[test]
    fn min_and_max_per_bucket() {
        let s = [0.1, -0.5, 0.9, 0.2, -0.3, 0.4, 0.0, 0.0];
        assert_eq!(compute_peaks(&s, 2), vec![-0.5, 0.9, -0.3, 0.4]);
    }

    #[test]
    fn more_buckets_than_samples_still_covers_every_bucket() {
        let out = compute_peaks(&[0.25, -0.75], 4);
        assert_eq!(out.len(), 8);
        // every bucket holds at least one sample, so min <= max and nothing is infinite
        for pair in out.chunks(2) {
            assert!(pair[0] <= pair[1]);
            assert!(pair[0].is_finite() && pair[1].is_finite());
        }
    }

    #[test]
    fn buckets_partition_the_input_without_gaps() {
        let (n, buckets) = (1000, 7);
        let mut next = 0;
        for b in 0..buckets {
            let (start, end) = bucket_range(b, n, buckets);
            assert_eq!(start, next);
            assert!(end > start);
            next = end;
        }
        assert_eq!(next, n);
    }

    #[test]
    fn bucket_range_does_not_overflow_for_a_fifteen_minute_file() {
        // 15 min at 48 kHz = 43.2M samples; 2048 buckets: b * n exceeds u32::MAX.
        let n = 15 * 60 * 48_000;
        let (start, end) = bucket_range(2047, n, 2048);
        assert!(start < end && end == n);
    }
}

/// Where note attacks start, in samples. It watches the level of the signal's first difference,
/// which follows the bright burst of a pick attack rather than the overall loudness, so a new
/// note is found even while the last one is still ringing.
pub fn find_onsets(x: &[f32]) -> Vec<usize> {
    const BLOCK: usize = 256;
    let env: Vec<f32> = x
        .chunks(BLOCK)
        .map(|c| (c.windows(2).map(|w| (w[1] - w[0]) * (w[1] - w[0])).sum::<f32>() / c.len() as f32).sqrt())
        .collect();
    let floor = env.iter().cloned().fold(0.0f32, f32::max) * 0.05;
    let mut out: Vec<usize> = Vec::new();
    for i in 0..env.len() {
        let before = env[i.saturating_sub(4)..i].iter().cloned().fold(0.0f32, f32::max);
        let clear = out.last().map_or(true, |&t| i * BLOCK >= t + BLOCK * 8);
        if clear && env[i] > floor && env[i] > before * 1.4 + floor * 0.2 {
            out.push(i * BLOCK);
        }
    }
    out
}

/// Maps output time to input time. Plain stretching is a straight line of slope `ratio`. When
/// slowing down, the stretch of input around each attack runs at slope 1 (so every frame that
/// holds the attack puts it in the same place, and it is heard once, not smeared into several),
/// and the sustain between attacks is stretched a little more to make up the length.
struct TimeMap {
    /// (output start, input start, slope), in output order.
    segments: Vec<(f64, f64, f64)>,
}

impl TimeMap {
    fn new(n: usize, out_len: usize, ratio: f32, onsets: &[usize], frame: usize, seek: usize) -> Self {
        let plain = TimeMap { segments: vec![(0.0, 0.0, ratio as f64)] };
        if ratio >= 1.0 || onsets.is_empty() {
            return plain;
        }
        // A frame starting anywhere in [attack - frame, attack] contains the attack, and the match
        // search can move a frame by `seek` either way.
        let mut spans: Vec<(usize, usize)> = Vec::new();
        for &t in onsets {
            let (a, b) = (t.saturating_sub(frame + seek), (t + seek + 256).min(n));
            match spans.last_mut() {
                Some(last) if a <= last.1 => last.1 = b.max(last.1),
                _ => spans.push((a, b)),
            }
        }
        let protected: usize = spans.iter().map(|(a, b)| b - a).sum();
        if protected >= n || protected >= out_len {
            return plain;
        }
        let slope = (n - protected) as f64 / (out_len - protected) as f64;
        let mut segments = Vec::new();
        let (mut i, mut o) = (0usize, 0.0f64);
        for (a, b) in spans {
            if a > i {
                segments.push((o, i as f64, slope));
                o += (a - i) as f64 / slope;
            }
            segments.push((o, a as f64, 1.0));
            o += (b - a) as f64;
            i = b;
        }
        segments.push((o, i as f64, slope));
        TimeMap { segments }
    }

    fn input_at(&self, out_pos: f64) -> f64 {
        let k = self.segments.partition_point(|s| s.0 <= out_pos).max(1) - 1;
        let (o, i, slope) = self.segments[k];
        i + (out_pos - o) * slope
    }
}

/// WSOLA time-stretch of several channels at once. `ratio` is playback speed: 0.5 gives output
/// twice as long at the same pitch. Frames of `frame` samples are overlap-added at a fixed
/// synthesis hop; each analysis position is nudged by up to `seek` samples to the best waveform
/// match. The match is found once, on the average of the channels, and used for all of them, so
/// left and right stay locked together.
pub fn stretch_channels(channels: &[&[f32]], ratio: f32, frame: usize, seek: usize) -> Vec<Vec<f32>> {
    let n = channels.first().map_or(0, |c| c.len());
    if n == 0 || !(ratio > 0.0) || frame < 4 || (ratio - 1.0).abs() < 1e-6 {
        return channels.iter().map(|c| c.to_vec()).collect();
    }
    let guide: Vec<f32> = if channels.len() == 1 {
        channels[0].to_vec()
    } else {
        (0..n).map(|i| channels.iter().map(|c| c.get(i).copied().unwrap_or(0.0)).sum::<f32>() / channels.len() as f32).collect()
    };
    let hop = frame / 4;
    let out_len = (n as f64 / ratio as f64).round() as usize;
    let map = TimeMap::new(n, out_len, ratio, &find_onsets(&guide), frame, seek);
    let win: Vec<f32> = (0..frame)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * (i as f32 + 0.5) / frame as f32).cos())
        .collect();
    let mut outs = vec![vec![0.0f32; out_len + frame]; channels.len()];
    let mut norm = vec![0.0f32; out_len + frame];
    // The natural continuation of the previous frame, used as the match target.
    let mut target = vec![0.0f32; frame];
    // Normalised correlation on every `stride`-th sample: loud passages must not win just by being loud.
    let score = |c: usize, target: &[f32], stride: usize| -> f32 {
        let (mut dot, mut energy) = (0.0f32, 1e-9f32);
        let mut i = 0;
        while i < frame && c + i < n {
            let v = guide[c + i];
            dot += v * target[i];
            energy += v * v;
            i += stride;
        }
        dot / energy.sqrt()
    };
    let mut pos = 0usize;
    while pos < out_len {
        let centre = map.input_at(pos as f64) as isize;
        let mut best = centre.clamp(0, n as isize - 1) as usize;
        if pos > 0 {
            let lo = (centre - seek as isize).max(0) as usize;
            let hi = (centre + seek as isize).clamp(0, n as isize - 1) as usize;
            // Coarse pass, then a fine pass around the coarse winner.
            let mut top = f32::NEG_INFINITY;
            let mut c = lo;
            while c <= hi {
                let s = score(c, &target, 8);
                if s > top {
                    top = s;
                    best = c;
                }
                c += 4;
            }
            let (flo, fhi) = (best.saturating_sub(3).max(lo), (best + 3).min(hi));
            top = f32::NEG_INFINITY;
            for c in flo..=fhi {
                let s = score(c, &target, 2);
                if s > top {
                    top = s;
                    best = c;
                }
            }
        }
        for (ch, out) in channels.iter().zip(outs.iter_mut()) {
            for i in 0..frame {
                let x = if best + i < ch.len() { ch[best + i] } else { 0.0 };
                out[pos + i] += x * win[i];
            }
        }
        for i in 0..frame {
            norm[pos + i] += win[i];
            // Next target: what followed this frame in the source.
            let idx = best + hop + i;
            target[i] = if idx < n { guide[idx] } else { 0.0 };
        }
        pos += hop;
    }
    for out in outs.iter_mut() {
        out.truncate(out_len);
        for (o, w) in out.iter_mut().zip(norm.iter()) {
            if *w > 1e-6 {
                *o /= *w;
            }
        }
    }
    outs
}

/// WSOLA time-stretch of a mono signal. See `stretch_channels`.
pub fn stretch(input: &[f32], ratio: f32, frame: usize, seek: usize) -> Vec<f32> {
    stretch_channels(&[input], ratio, frame, seek).remove(0)
}

/// The stretch the app uses, with its frame and search sizes chosen from the sample rate.
pub fn stretch_tuned(samples: &[f32], speed: f32, sample_rate: f32) -> Vec<f32> {
    let frame = ((sample_rate * 0.04) as usize).next_power_of_two().max(256);
    stretch(samples, speed, frame, frame / 4)
}

/// Browser entry point for a stereo part: left then right, each as long as the stretched result.
#[wasm_bindgen]
pub fn stretch_stereo(left: &[f32], right: &[f32], speed: f32, sample_rate: f32) -> Vec<f32> {
    let frame = ((sample_rate * 0.04) as usize).next_power_of_two().max(256);
    let mut parts = stretch_channels(&[left, right], speed, frame, frame / 4);
    let mut out = parts.remove(0);
    out.extend(parts.remove(0));
    out
}

/// Browser entry point: `stretch_mono(Float32Array, speed) -> Float32Array`.
#[wasm_bindgen]
pub fn stretch_mono(samples: &[f32], speed: f32, sample_rate: f32) -> Vec<f32> {
    stretch_tuned(samples, speed, sample_rate)
}

/// Read `x` at a fractional step, linearly interpolated: `step` 2 gives half the length and
/// twice the pitch.
pub fn resample(x: &[f32], step: f64) -> Vec<f32> {
    if x.is_empty() || !(step > 0.0) {
        return Vec::new();
    }
    let out_len = (x.len() as f64 / step).round().max(1.0) as usize;
    (0..out_len)
        .map(|i| {
            let p = i as f64 * step;
            let k = p.floor() as usize;
            let frac = (p - k as f64) as f32;
            let a = x.get(k).copied().unwrap_or(0.0);
            let b = x.get(k + 1).copied().unwrap_or(a);
            a + (b - a) * frac
        })
        .collect()
}

/// Speed and pitch in one pass: stretch every channel by `speed / f` (f = 2^(semitones/12)),
/// then resample by `f`, so the result is `1/speed` as long and `semitones` higher.
pub fn render_channels(channels: &[&[f32]], speed: f32, semitones: f32, sample_rate: f32) -> Vec<Vec<f32>> {
    let f = 2f64.powf(semitones as f64 / 12.0);
    let frame = ((sample_rate * 0.04) as usize).next_power_of_two().max(256);
    let stretched = stretch_channels(channels, (speed as f64 / f) as f32, frame, frame / 4);
    if (f - 1.0).abs() < 1e-9 {
        return stretched;
    }
    stretched.iter().map(|c| resample(c, f)).collect()
}

/// Browser entry point: a mono part at `speed` and `semitones`.
#[wasm_bindgen]
pub fn render_mono(samples: &[f32], speed: f32, semitones: f32, sample_rate: f32) -> Vec<f32> {
    render_channels(&[samples], speed, semitones, sample_rate).remove(0)
}

/// Browser entry point: a stereo part at `speed` and `semitones`, left then right.
#[wasm_bindgen]
pub fn render_stereo(left: &[f32], right: &[f32], speed: f32, semitones: f32, sample_rate: f32) -> Vec<f32> {
    let mut parts = render_channels(&[left, right], speed, semitones, sample_rate);
    let mut out = parts.remove(0);
    out.extend(parts.remove(0));
    out
}

/// Browser entry point: one chord index per bar (0..11 major, 12..23 minor, -1 none).
#[wasm_bindgen]
pub fn chords(samples: &[f32], sample_rate: f32, bpm: f32, downbeat: f32, beats_per_bar: u32) -> Vec<i32> {
    analysis::detect_chords(samples, sample_rate, bpm, downbeat, beats_per_bar as usize)
}

/// Browser entry point: fundamental in Hz of a short window, or 0 when nothing is heard.
#[wasm_bindgen]
pub fn pitch(samples: &[f32], sample_rate: f32) -> f32 {
    analysis::detect_pitch(samples, sample_rate)
}

/// Browser entry point: `[bpm, firstBeatSeconds]`, zeros when no tempo is found.
#[wasm_bindgen]
pub fn tempo(samples: &[f32], sample_rate: f32) -> Vec<f32> {
    analysis::detect_tempo(samples, sample_rate).to_vec()
}

/// Browser entry point: 0..11 C..B major, 12..23 C..B minor, -1 unknown.
#[wasm_bindgen]
pub fn key(samples: &[f32], sample_rate: f32) -> i32 {
    analysis::detect_key(samples, sample_rate)
}

/// Browser entry point: `[percussive | bass | harmonic]`, each as long as the input.
#[wasm_bindgen]
pub fn split(samples: &[f32], sample_rate: f32) -> Vec<f32> {
    analysis::quick_split(samples, sample_rate, 200.0)
}

#[cfg(test)]
mod stretch_tests {
    use super::*;

    fn sine(freq: f32, sr: f32, secs: f32) -> Vec<f32> {
        (0..(sr * secs) as usize)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr).sin() * 0.5)
            .collect()
    }

    fn zero_crossings(x: &[f32]) -> usize {
        x.windows(2).filter(|w| w[0] <= 0.0 && w[1] > 0.0).count()
    }

    #[test]
    fn half_speed_doubles_length() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = stretch(&x, 0.5, 2048, 512);
        assert_eq!(y.len(), 88200);
    }

    #[test]
    fn pitch_is_preserved() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = stretch(&x, 0.75, 2048, 512);
        let f_in = zero_crossings(&x) as f32 / 1.0;
        let f_out = zero_crossings(&y) as f32 / (y.len() as f32 / 44100.0);
        assert!((f_in - f_out).abs() / f_in < 0.02, "{f_in} vs {f_out}");
    }

    /// Plucked notes, each starting with its own short burst of pick noise.
    fn plucks(sr: f32, gap: f32, secs: f32) -> Vec<f32> {
        let n = (sr * secs) as usize;
        let mut x = vec![0.0f32; n];
        let mut seed = 99u32;
        for k in 0..(secs / gap) as usize {
            let (start, f) = ((k as f32 * gap * sr) as usize, [196.0, 246.94, 293.66, 392.0][k % 4]);
            for i in 0..((gap * 1.5 * sr) as usize).min(n - start) {
                let t = i as f32 / sr;
                let tone: f32 = (1..=6).map(|h| (2.0 * std::f32::consts::PI * f * h as f32 * t).sin() / h as f32 * (-t * (2.0 + h as f32)).exp()).sum();
                x[start + i] += 0.3 * tone * (1.0 - (-t * 800.0).exp());
                if i < 350 {
                    seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                    x[start + i] += ((seed >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.5 * (1.0 - i as f32 / 350.0);
                }
            }
        }
        x
    }

    /// How many times the pick noise that starts at `t` in `x` turns up in `y`.
    fn copies_of_attack(x: &[f32], y: &[f32], t: usize) -> usize {
        let bright = |v: &[f32]| -> Vec<f32> { v.windows(2).map(|w| w[1] - w[0]).collect() };
        let (xh, yh) = (bright(x), bright(y));
        let tpl = &xh[t..t + 300];
        let te = tpl.iter().map(|v| v * v).sum::<f32>().sqrt();
        let (mut copies, mut last) = (0, 0usize);
        for c in 0..yh.len() - 300 {
            let seg = &yh[c..c + 300];
            let e = seg.iter().map(|v| v * v).sum::<f32>().sqrt();
            if e < te * 0.3 {
                continue;
            }
            let dot: f32 = seg.iter().zip(tpl).map(|(a, b)| a * b).sum();
            if dot / (e * te) > 0.7 && (copies == 0 || c > last + 200) {
                copies += 1;
                last = c;
            }
        }
        copies
    }

    #[test]
    fn slowing_down_plays_each_pick_attack_once() {
        // Plain WSOLA repeats an attack in every frame that overlaps it: a flam at half speed.
        let sr = 44100.0;
        let x = plucks(sr, 0.3, 3.0);
        for speed in [0.75, 0.5, 0.25] {
            let y = stretch_tuned(&x, speed, sr);
            for k in 1..9 {
                let t = (k as f32 * 0.3 * sr) as usize;
                assert_eq!(copies_of_attack(&x, &y, t), 1, "speed {speed}, note {k}");
            }
        }
    }

    #[test]
    fn finds_every_pluck_even_while_the_last_note_rings() {
        let onsets = find_onsets(&plucks(44100.0, 0.3, 3.0));
        assert_eq!(onsets.len(), 10, "{onsets:?}");
    }

    #[test]
    fn stereo_channels_stay_locked_together() {
        // The same signal on both sides must come out identical: one set of splice points for all channels.
        let x = plucks(44100.0, 0.3, 2.0);
        let quiet: Vec<f32> = x.iter().map(|v| v * 0.5).collect();
        let out = stretch_channels(&[&x, &quiet], 0.5, 2048, 512);
        assert_eq!(out[0].len(), out[1].len());
        let worst = out[0].iter().zip(&out[1]).map(|(a, b)| (a * 0.5 - b).abs()).fold(0.0f32, f32::max);
        assert!(worst < 1e-6, "{worst}");
    }

    #[test]
    fn quarter_speed_keeps_pitch_and_level() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = stretch(&x, 0.25, 2048, 512);
        assert_eq!(y.len(), 176400);
        let f_out = zero_crossings(&y) as f32 / (y.len() as f32 / 44100.0);
        assert!((220.0 - f_out).abs() / 220.0 < 0.02, "{f_out}");
        let peak = y[4096..y.len() - 4096].iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak > 0.4 && peak < 0.6, "{peak}");
    }

    #[test]
    fn faster_than_original_shortens_and_keeps_pitch() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = stretch(&x, 1.25, 2048, 512);
        assert_eq!(y.len(), 35280);
        let f_out = zero_crossings(&y) as f32 / (y.len() as f32 / 44100.0);
        assert!((220.0 - f_out).abs() / 220.0 < 0.02, "{f_out}");
    }

    #[test]
    fn unity_and_empty_are_identity() {
        let x = sine(220.0, 44100.0, 0.1);
        assert_eq!(stretch(&x, 1.0, 2048, 512), x);
        assert!(stretch(&[], 0.5, 2048, 512).is_empty());
    }

    #[test]
    fn resample_halves_length_and_doubles_pitch() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = resample(&x, 2.0);
        assert_eq!(y.len(), 22050);
        let f_out = zero_crossings(&y) as f32 / (y.len() as f32 / 44100.0);
        assert!((440.0 - f_out).abs() / 440.0 < 0.02, "{f_out}");
        assert!(resample(&[], 2.0).is_empty());
    }

    #[test]
    fn render_shifts_pitch_and_keeps_length() {
        let x = sine(220.0, 44100.0, 1.0);
        // Up a fifth (7 semitones) at full speed: same length, 329.6 Hz.
        let y = render_channels(&[&x], 1.0, 7.0, 44100.0).remove(0);
        assert!((y.len() as i64 - 44100).abs() < 200, "{}", y.len());
        let f_out = zero_crossings(&y[2048..y.len() - 2048]) as f32 / ((y.len() - 4096) as f32 / 44100.0);
        assert!((329.63 - f_out).abs() / 329.63 < 0.03, "{f_out}");
        // Down an octave at half speed: twice the length, 110 Hz.
        let z = render_channels(&[&x], 0.5, -12.0, 44100.0).remove(0);
        assert!((z.len() as i64 - 88200).abs() < 400, "{}", z.len());
        let f_z = zero_crossings(&z[2048..z.len() - 2048]) as f32 / ((z.len() - 4096) as f32 / 44100.0);
        assert!((110.0 - f_z).abs() / 110.0 < 0.03, "{f_z}");
        // Zero semitones is a plain stretch.
        assert_eq!(render_channels(&[&x], 0.75, 0.0, 44100.0)[0], stretch_tuned(&x, 0.75, 44100.0));
    }

    #[test]
    fn amplitude_is_stable() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = stretch(&x, 0.5, 2048, 512);
        let peak = y[4096..y.len() - 4096].iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak > 0.45 && peak < 0.55, "{peak}");
    }
}
