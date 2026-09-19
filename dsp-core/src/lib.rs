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
