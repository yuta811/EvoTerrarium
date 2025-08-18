# EvoTerrarium

This project simulates evolving creatures in a small 3D world.

## Genes

Each creature has a set of genes controlling behavior and physiology:

- `size` – body scale and energy capacity.
- `speed` – base acceleration and leg length.
- `thermo` – preferred environmental temperature.
- `climb` – ability to traverse slopes.
- `swim` – swimming efficiency and tail/fins.
- `social` – alignment, cohesion and mating tendencies.
- `perception` – sensory range for detecting other entities and resources.
- `diet` – herbivore (0) or carnivore (1).

`perception` is inherited and mutated independently. It now drives the sensing
radius in the simulation loop and also affects the head size in the creature
visualization. Documentation previously referencing `social` for sensing now
refers to `perception`.
