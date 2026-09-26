---
title: "How the app's heat model works"
url: https://github.com/allisonylee/hackumbc2026
source: Baltimore Tree Planting Planner (hackUMBC 2026)
---

The app uses a machine-learning model to estimate how hot each block gets on a summer afternoon, and how much cooler it would be with more trees. It learns from real air temperatures that volunteers measured across Baltimore on August 29, 2018, during NOAA's Heat Watch campaign.

The model is a LightGBM gradient-boosted tree model. For each hexagon it looks only at physical features: tree canopy, pavement, buildings, roads, grass, nearby canopy and pavement, nearby water, and distance from the Inner Harbor. It deliberately leaves out income, race and other social data. Those correlate with heat, but they don't physically cause it, and including them would make the model's "what if we planted trees here?" answers unreliable.

The model is built so that adding canopy can never make a block hotter. It is trained on 2018 land cover, matching the year the temperatures were measured, and then applied to 2021 land cover, the most recent detailed map, to estimate today's heat.

To estimate cooling, the app adds tree crown to a block a little at a time, 25 square meters per step, and records how much the predicted temperature drops each time. These drops shrink as a block gets leafier, so a paved, treeless block gains the most from its first trees. The model is checked with spatial cross-validation, which tests it on whole areas of the city it didn't train on. SHAP values explain which features make a given block hot, for example lots of pavement or little canopy.

Limits: the temperature data comes from one hot afternoon, the model estimates air temperature and not how hot it feels indoors, and cooling estimates assume trees reach about 20 years of growth.
