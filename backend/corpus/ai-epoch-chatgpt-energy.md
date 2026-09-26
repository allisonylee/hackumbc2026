---
title: "How much energy does a ChatGPT query use? (Epoch AI estimate)"
url: https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
source: Josh You, Epoch AI, 2025
---

**Key takeaway:** Epoch AI estimated that a typical GPT-4o query uses about **0.3 Wh** of electricity. That is about ten times lower than the older, widely repeated figure of **3 Wh** per query.

## Who and when
Josh You of Epoch AI published this on February 7, 2025. It is an outside estimate built from assumptions, not a measurement from OpenAI.

## How the estimate works
The author builds the number from assumptions:
- GPT-4o has roughly 100 billion active parameters (a pessimistic pick; its total size is estimated at 100 to 400 billion).
- A typical reply has about 500 output tokens, about 400 words.
- It runs on NVIDIA H100 GPUs, about 1,500 W per GPU once server overhead is included.
- The GPUs reach about 10% of their peak compute during use, while drawing about 70% of peak power.

He calls the result "relatively pessimistic", meaning it leans toward a higher answer.

## Why the old 3 Wh figure was higher
The older estimate assumed much longer replies (about 2,000 output tokens), older A100 chips, and a bigger model. Newer hardware and more realistic reply lengths bring the number down.

## When a query uses more
- Long inputs cost more. With about 10,000 input tokens, the estimate rises to about **2.5 Wh**. With about 100,000 input tokens, it is about **40 Wh**.
- Reasoning models, such as o1 or o3, write many hidden tokens and probably use much more energy.
- Overall the author gives a range of about **0.1 to 4 Wh** per query, depending on the model and how it is used.

## For scale
The article notes an average US household uses more than **28,000 Wh** of electricity a day. So a single ordinary chatbot query is a very small part of a person's daily energy use.

## Caveats
This is a rough estimate, not a measurement. It covers electricity during use (inference), not training the model, and not water.
