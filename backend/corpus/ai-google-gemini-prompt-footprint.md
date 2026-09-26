---
title: "How much energy and water does a Gemini prompt use? (Google 2025 measurement)"
url: https://arxiv.org/abs/2508.15734
source: Elsworth et al. (Google), arXiv 2025
---

**Key takeaway:** Google measured its own production AI service and reported that the median Gemini Apps text prompt in May 2025 used about **0.24 Wh** of energy, emitted about **0.03 gCO2e**, and consumed about **0.26 mL** of water. The paper compares the energy to watching TV for less than nine seconds, and the water to roughly five drops.

## What the paper is
"Measuring the environmental impact of delivering AI at Google Scale" (submitted August 2025) was written by Google staff, including Jeff Dean and David Patterson. It measures real serving infrastructure, not a lab test. These are company-reported numbers about Google's own systems.

## What is counted
Google says it used a "full stack" boundary. The share of energy by part:
- Active AI accelerators (TPUs): about 58%
- Host CPU and memory: about 25%
- Idle machines kept ready for reliability and fast response: about 10%
- Data center overhead such as cooling (through PUE): about 8%

A narrower method that counts only the active accelerators, sampled from the most efficient data centers, gives about **0.10 Wh** per prompt. So the counting boundary changes the answer by more than two times.

## What is not counted
- Training the model and storing data
- The user's phone or computer
- Networking outside the data center (and internal networking, which they call negligible)
- Other kinds of prompts; the figure is for text prompts only

## Assumptions behind carbon and water
- Carbon uses a market-based grid factor of **94 gCO2e/kWh**, which reflects Google's clean energy purchases. A location-based factor would give a higher number.
- Water uses a fleet water usage effectiveness (WUE) of **1.15 L/kWh**, which is water used on site for cooling.
- Fleet average PUE was **1.09**.

## Change over time
Google reports that over one year (May 2024 to May 2025) energy per median prompt fell **33 times** and carbon per prompt fell **44 times**, from better models, software and hardware, and cleaner power.

## Caveats
- It is a median, so many prompts use more.
- Google says its number is lower than many public estimates.
- A small per-prompt number can still add up across billions of prompts.
