# Cron memory probe

Measures what the nightly cron jobs do to this process's memory, without
touching the shared cluster.

## Why

Three crons run back to back (02:00 products, 03:30 sales, 04:00 GS1) and RSS
steps up at each one and does not come back down. This records, per job:

- `before` / `peak` / `after` — sampled every 20 ms while the job runs, so a
  transient allocation spike is visible (the value *after* a job hides it, and
  the peak is what raises the high-water mark);
- `afterFullGC` — what a forced collection could reclaim, i.e. the floor;
- then `PROBE_REPEAT` per iteration, so `--repeat=2` shows whether a second
  night starts from a higher baseline than the first.

`after` far above `afterFullGC` is the leak-shaped symptom: nothing collects, so
the heap the job allocated stays committed until something else needs the space.

## Setup

```bash
# 1. Clone the dev DB once (read-only on the source).
node --env-file=.env server/scripts/memProbe/clone.js \
     --to=mongodb://127.0.0.1:27017/store_memprobe_base

# 2. Copy the clone per run, so every run starts from identical data.
node server/scripts/memProbe/clone.js \
     --from=mongodb://127.0.0.1:27017/store_memprobe_base \
     --to=mongodb://127.0.0.1:27017/store_memprobe
```

## Run

```bash
node --env-file=.env --max-old-space-size=768 \
     server/scripts/memProbe/run.js --job=sales --repeat=2
```

`--job=nightly|sales|gs1|gov|holiday`, or `night` for nightly → sales → GS1 in
the order the scheduler runs them. `--db` and `--redis` default to the local
clone and Redis db 9.

The runner calls the same exported functions the scheduler calls
(`runNightlySync`, `runSalesSync`, ...), not private copies of their bodies.

## Caveats

- Node's HASHSET cache answers reads from Redis *only* — an empty hashset
  returns `[]` and never falls back to Mongo. The probe flushes its Redis DB and
  primes the cache from the clone first, otherwise every read looks empty.
- The image and GS1 fetch/process workers are **not** started. They share the
  serving process in production, so the sharp/libvips share of the 02:00/04:00
  step is not in these numbers. `runImages` still stages real media zips in the
  bucket, so `--imageLimit` defaults to 5.
- RSS on Windows is not RSS on Linux: glibc arenas and `MADV_FREE` decide
  whether freed pages go back to the kernel. Compare `heap`/`heapTotal` across
  runs here; use the Linux container for the RSS plateau itself.
