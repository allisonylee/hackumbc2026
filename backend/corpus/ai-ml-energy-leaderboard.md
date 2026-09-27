---
title: "How is the energy of one AI answer measured? (ML.ENERGY Leaderboard)"
url: https://ml.energy/blog/measurement/energy/diagnosing-inference-energy-consumption-with-the-mlenergy-leaderboard-v30/
source: ML.ENERGY Initiative, 2026
---

**Key takeaway:** The ML.ENERGY Leaderboard measures how much GPU energy open AI models use to produce one full response. What task you ask for matters a lot: long step-by-step problem solving used about 25 times more energy per response than ordinary chat.

## Who runs it
The ML.ENERGY Initiative runs the benchmark and leaderboard. This summary comes from a January 29, 2026 blog post by Jae-Won Chung that explains the latest results.

## How it measures
- It reports energy for a whole response (a full chat answer, an image, or a video), not per word.
- The numbers are GPU energy.
- Units are joules (J). One watt-hour (Wh) is 3,600 joules.

## Benchmark v3.0 (released December 2025)
Version 3.0 covered 46 models across 7 tasks, run on NVIDIA H100 and B200 GPUs. On B200 GPUs:
- Text conversation averaged about **184 J** per response.
- Problem solving averaged about **4,625 J** per response.
- For one model, Qwen 3 32B, chat used about **95 J** and problem solving about **2,192 J**. The difference came mostly from answer length: about 627 versus 7,035 output tokens.
- Text-to-image energy varied about 20 times across models. Text-to-video used about 26 kJ to 1.16 MJ per video, one to two orders of magnitude more than images.

## What drives energy
Longer answers, how many requests the server handles at once (batch size), memory limits, and the hardware. Longer answers use more memory, which limits batch size and raises energy per token. Newer B200 GPUs generally used less energy than H100s.

## Caveat
These results come from data center GPUs serving many requests at once, which spreads the cost across users. The benchmark ran only on data center GPUs, not laptops. A laptop answering one person at a time does not get that sharing, so its energy per answer can't be read straight from these numbers, even for a smaller model.
