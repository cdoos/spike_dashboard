"""Algorithm registry and adapters for spike sorting pipelines."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import numpy as np


@dataclass
class AlgorithmResult:
    """Container describing outputs from a spike sorting algorithm run."""

    filtered: Optional[np.ndarray] = None
    intermediates: Dict[str, Any] = field(default_factory=dict)

    def to_serialisable(self) -> Dict[str, Any]:
        """Convert the result into JSON-serialisable primitives."""
        payload: Dict[str, Any] = {}
        if self.filtered is not None:
            payload["filtered"] = self.filtered.tolist()
        if self.intermediates:
            payload["intermediates"] = _serialise_intermediates(self.intermediates)
        return payload


@dataclass
class AlgorithmSpec:
    """Metadata describing an available spike sorting algorithm."""

    name: str
    display_name: str
    description: str
    runner: Optional[Callable[[np.ndarray, Dict[str, Any]], AlgorithmResult]] = None
    available: bool = True
    parameters: Dict[str, Any] = field(default_factory=dict)

    def run(self, data: np.ndarray, params: Optional[Dict[str, Any]] = None) -> AlgorithmResult:
        if not self.available:
            raise AlgorithmUnavailable(f"Algorithm '{self.name}' is not available in this environment")
        if self.runner is None:
            raise AlgorithmUnavailable(f"Algorithm '{self.name}' does not define a runner")
        effective_params = dict(self.parameters)
        if params:
            effective_params.update(params)
        return self.runner(data, effective_params)


class AlgorithmUnavailable(RuntimeError):
    """Raised when an algorithm cannot be executed."""


class AlgorithmRegistry:
    """Registry storing the known spike sorting algorithms."""

    def __init__(self) -> None:
        self._algorithms: Dict[str, AlgorithmSpec] = {}

    def register(self, spec: AlgorithmSpec) -> None:
        self._algorithms[spec.name] = spec

    def list(self) -> List[AlgorithmSpec]:
        return sorted(self._algorithms.values(), key=lambda spec: spec.display_name.lower())

    def get(self, name: str) -> AlgorithmSpec:
        if name not in self._algorithms:
            raise KeyError(f"Unknown algorithm '{name}'")
        return self._algorithms[name]

    def serialise(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": spec.name,
                "displayName": spec.display_name,
                "description": spec.description,
                "available": spec.available,
                "parameters": spec.parameters,
            }
            for spec in self.list()
        ]

    def ensure_algorithm(self, name: str) -> AlgorithmSpec:
        spec = self.get(name)
        if not spec.available:
            raise AlgorithmUnavailable(f"Algorithm '{name}' is not available")
        return spec


def _serialise_intermediates(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _serialise_intermediates(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialise_intermediates(val) for val in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


algorithm_registry = AlgorithmRegistry()


def register_torchbci_algorithms() -> None:
    """Attempt to register algorithms sourced from the optional torchbci package."""

    try:
        from torchbci.algorithms import JimsAlgorithm  # type: ignore
    except ImportError:
        try:
            from torchbci.algorithms import JimsAlgorithm  # type: ignore
        except ImportError:
            JimsAlgorithm = None
    try:
        import torch
    except ImportError:
        torch = None

    if JimsAlgorithm is None or torch is None:
        algorithm_registry.register(
            AlgorithmSpec(
                name="torchbci-jims",
                display_name="TorchBCI JimsAlgorithm",
                description=(
                    "TorchBCI JimsAlgorithm pipeline (filter + detection + alignment). "
                    "Install torchbci to enable this option."
                ),
                available=False,
                parameters={
                    "window_size": 21,
                    "threshold": 50,
                    "frame_size": 7,
                    "normalize": "none",
                },
            )
        )
        return

    def _run_jims(data: np.ndarray, params: Dict[str, Any]) -> AlgorithmResult:
        tensor = torch.as_tensor(data, dtype=torch.float32)
        algorithm = JimsAlgorithm(**params)
        filtered_tensor = algorithm.filter(tensor)
        peaks, peak_vals = algorithm.detection(filtered_tensor)
        frames, frames_meta = algorithm.feature_selection(filtered_tensor, peaks)
        aligned_frames, aligned_meta, aligned_frames_jimsfeatures, aligned_frames_fullfeatures = algorithm.alignment(
            frames, frames_meta
        )
        clusters, centroids, clusters_meta = algorithm.clustering(aligned_frames_jimsfeatures, aligned_meta)
        intermediates: Dict[str, Any] = {
            "peaks": peaks.detach().cpu().numpy(),
            "peakValues": peak_vals.detach().cpu().numpy(),
            "framesMeta": frames_meta,
            "alignedMeta": aligned_meta,
            "clustersMeta": clusters_meta,
            "centroids": centroids.detach().cpu().numpy(),
        }
        return AlgorithmResult(filtered=filtered_tensor.detach().cpu().numpy(), intermediates=intermediates)

    algorithm_registry.register(
        AlgorithmSpec(
            name="torchbci-jims",
            display_name="TorchBCI JimsAlgorithm",
            description="Run the TorchBCI JimsAlgorithm spike sorting pipeline and expose intermediate artefacts.",
            runner=_run_jims,
            available=True,
            parameters={
                "window_size": 21,
                "threshold": 50,
                "frame_size": 7,
                "normalize": "none",
            },
        )
    )


def register_builtin_algorithm(
    name: str,
    display_name: str,
    description: str,
    runner: Callable[[np.ndarray, Dict[str, Any]], AlgorithmResult],
    parameters: Optional[Dict[str, Any]] = None,
) -> None:
    algorithm_registry.register(
        AlgorithmSpec(
            name=name,
            display_name=display_name,
            description=description,
            runner=runner,
            available=True,
            parameters=parameters or {},
        )
    )


__all__ = [
    "AlgorithmResult",
    "AlgorithmSpec",
    "AlgorithmUnavailable",
    "AlgorithmRegistry",
    "algorithm_registry",
    "register_builtin_algorithm",
    "register_torchbci_algorithms",
]
