---
title: "How much water does AI use? (Making AI Less Thirsty)"
url: https://arxiv.org/abs/2304.03271
source: Li, Yang, Islam and Ren, arXiv 2023 (revised 2025), Communications of the ACM
---

**Key takeaway:** This study estimated that AI uses water in two ways: on site to cool data centers, and off site at power plants that make the electricity. Its estimates are for GPT-3, an older model, and they count both kinds of water.

## Two kinds of water
- **Scope 1 (on site):** water used to cool the data center, much of it evaporated in cooling towers.
- **Scope 2 (off site):** water used by power plants to generate the electricity the data center uses.
The paper also separates **withdrawal** (water taken, some of it returned) from **consumption** (water evaporated or otherwise lost from the local supply).

## Training
The authors estimated that training GPT-3 in Microsoft's US data centers evaporated about **700,000 liters** of water on site, and about **5.4 million liters** counting both on-site and power-plant water.

## Using the model (inference)
For a medium-length GPT-3 response, the estimated water use depends heavily on location:
- US average: about **16.9 mL** per response, or about 30 responses per 500 mL bottle.
- Washington state (highest): about **47.5 mL**, or about 10 responses per bottle.
- Texas: about **7.6 mL**; Ireland: about **7.1 mL**.

The authors call these estimates conservative and say real use could be higher.

## Big picture
They projected that global AI demand could account for **4.2 to 6.6 billion cubic meters** of water withdrawal per year by 2027.

## How to read this today
- It was first written in April 2023 about GPT-3, an older model on older hardware.
- It counts power-plant water. The authors note that AI reports usually leave out water use, and power-plant water even more so.
- So its numbers are not directly comparable with figures that count only on-site water. The answer depends on what is counted, where, and when.
- Location matters: the same model can use very different amounts of water depending on local climate and the power grid.
