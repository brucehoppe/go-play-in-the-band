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

/// WSOLA time-stretch of a mono signal. `ratio` is playback speed: 0.5 gives output twice as
/// long at the same pitch. Frames of `frame` samples are overlap-added at a fixed synthesis hop,
/// and each analysis position is nudged by up to `seek` samples to the best waveform match.
pub fn stretch(input: &[f32], ratio: f32, frame: usize, seek: usize) -> Vec<f32> {
    let n = input.len();
    if n == 0 || !(ratio > 0.0) || frame < 4 {
        return input.to_vec();
    }
    if (ratio - 1.0).abs() < 1e-6 {
        return input.to_vec();
    }
    let hop = frame / 2;
    let out_len = (n as f64 / ratio as f64).round() as usize;
    let win: Vec<f32> = (0..frame)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * (i as f32 + 0.5) / frame as f32).cos())
        .collect();
    let mut out = vec![0.0f32; out_len + frame];
    let mut norm = vec![0.0f32; out_len + frame];
    // The natural continuation of the previous frame, used as the match target.
    let mut target: Vec<f32> = input[..frame.min(n)].to_vec();
    target.resize(frame, 0.0);
    let mut pos = 0usize;
    let mut k = 0usize;
    while pos < out_len {
        let centre = (k as f64 * hop as f64 * ratio as f64) as isize;
        let mut best = centre.clamp(0, n as isize - 1);
        if k > 0 {
            let lo = (centre - seek as isize).max(0);
            let hi = (centre + seek as isize).min(n as isize - 1);
            let mut best_score = f32::NEG_INFINITY;
            let mut c = lo;
            while c <= hi {
                let mut s = 0.0f32;
                for i in (0..frame).step_by(8) {
                    let idx = c as usize + i;
                    if idx < n {
                        s += input[idx] * target[i];
                    }
                }
                if s > best_score {
                    best_score = s;
                    best = c;
                }
                c += 2;
            }
        }
        let b = best as usize;
        for i in 0..frame {
            let x = if b + i < n { input[b + i] } else { 0.0 };
            out[pos + i] += x * win[i];
            norm[pos + i] += win[i];
        }
        // Next target: what followed this frame in the source.
        for i in 0..frame {
            let idx = b + hop + i;
            target[i] = if idx < n { input[idx] } else { 0.0 };
        }
        pos += hop;
        k += 1;
    }
    out.truncate(out_len);
    for (o, w) in out.iter_mut().zip(norm.iter()) {
        if *w > 1e-6 {
            *o /= *w;
        }
    }
    out
}

/// Browser entry point: `stretch_mono(Float32Array, speed) -> Float32Array`.
#[wasm_bindgen]
pub fn stretch_mono(samples: &[f32], speed: f32, sample_rate: f32) -> Vec<f32> {
    let frame = ((sample_rate * 0.04) as usize).next_power_of_two().max(256);
    stretch(samples, speed, frame, frame / 4)
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
    fn amplitude_is_stable() {
        let x = sine(220.0, 44100.0, 1.0);
        let y = stretch(&x, 0.5, 2048, 512);
        let peak = y[4096..y.len() - 4096].iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak > 0.45 && peak < 0.55, "{peak}");
    }
}
