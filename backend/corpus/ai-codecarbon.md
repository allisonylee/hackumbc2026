---
title: "How does CodeCarbon estimate the energy and CO2 of code?"
url: https://docs.codecarbon.io/latest/explanation/methodology/
source: CodeCarbon documentation
---

**Key takeaway:** CodeCarbon is a Python tool that estimates how much electricity a program used and the carbon emissions from making that electricity. The basic formula is: emissions = energy used (kWh) times the carbon intensity of the local power grid (gCO2e per kWh).

## Measuring energy
CodeCarbon tracks the power of the CPU, GPU and RAM while code runs, and picks the best method the computer allows:
- **CPU:** On Linux it reads Intel RAPL energy counters. On Windows 11 it uses a similar Windows interface. On Apple Silicon Macs it uses Apple's `powermetrics` tool, which needs admin rights.
- **CPU fallback:** If no counter is available, it looks up the chip's rated power (TDP) and estimates use from CPU load, assuming 50% of TDP by default.
- **GPU:** NVIDIA GPUs are read through NVIDIA's NVML library. GPU power is measured for the whole device, not per program.
- **RAM:** Estimated at about **5 W per memory stick (DIMM)** on typical PCs, with a minimum of 10 W on x86 and 3 W on ARM systems.
- Disk, network, screen and cooling are usually small and are mostly left out.

## Choosing carbon intensity
CodeCarbon picks the grid carbon intensity in this order:
1. The cloud provider's region data, if running in the cloud.
2. Country data from Our World in Data.
3. The country's electricity mix, using fixed factors per fuel (an older method, now mostly replaced by Our World in Data). For example, coal about 995 and natural gas about 743 kg CO2 per MWh.
4. If nothing else is known, a world average of **475 gCO2e/kWh** from the IEA.

## Limits
- It counts only the CPU, GPU and RAM. It does not separately count disk, network transfers, displays or cooling.
- Results are estimates, and the measuring method depends on what hardware and permissions are available.
- It estimates energy and carbon, not water.

## Where it is used
Researchers have used it in AI studies. For example, the "Power Hungry Processing" study used CodeCarbon to compare AI models. The homepage is https://codecarbon.io.
