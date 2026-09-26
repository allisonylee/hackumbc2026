---
title: "Do generative AI models use more energy than task-specific models? (Power Hungry Processing)"
url: https://arxiv.org/abs/2311.16863
source: Luccioni, Jernite and Strubell, ACM FAccT 2024
---

**Key takeaway:** General-purpose generative models used far more energy than small models built for one task, even when controlling for model size. Image generation was the most energy-hungry task tested.

## The study
"Power Hungry Processing: Watts Driving the Cost of AI Deployment?" by Sasha Luccioni (Hugging Face), Yacine Jernite and Emma Strubell was published at ACM FAccT in June 2024. The authors tested **88 models** on **10 tasks** and **30 datasets**. They ran 1,000 inferences per test on a single GPU of a cloud node with 8 NVIDIA A100 GPUs and measured energy with the CodeCarbon tool.

## Energy per 1,000 inferences (averages by task)
- Text classification: about **0.002 kWh**
- Text generation: about **0.047 kWh**
- Summarization: about **0.049 kWh**
- Image generation: about **2.907 kWh**

## Other findings
- Image generation used over **1,450 times** more energy than text classification on average.
- The most efficient text generation model used energy equal to about 9% of a full smartphone charge for 1,000 inferences. The least efficient image model used as much as about 522 smartphone charges.
- The most carbon-intensive model, Stable Diffusion XL, produced about **1,594 gCO2e** per 1,000 images, similar to driving 4.1 miles in an average gasoline car.
- Training energy is eventually matched by use. For BLOOMz-7B, over **590 million** inferences equaled the energy of training it.

## What it means
The authors suggest weighing the usefulness of big multipurpose models against their extra energy and emissions. For a simple job, such as sorting text into categories, a small task-specific model can do the work with much less energy.

## Caveats
Measurements were on one hardware setup in 2023, and newer models and chips may differ. The numbers are for 1,000 inferences, not one.
