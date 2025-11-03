"""Background job manager for spike sorting algorithms."""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

from .algorithms import AlgorithmSpec, AlgorithmUnavailable, algorithm_registry


@dataclass
class JobResult:
    """Stores the outcome of a spike sorting job."""

    job_id: str
    channels: List[int]
    start_time: int
    end_time: int
    raw: np.ndarray
    filtered: Optional[np.ndarray]
    intermediates: Dict[str, Any] = field(default_factory=dict)

    def to_summary(self) -> Dict[str, Any]:
        return {
            "jobId": self.job_id,
            "channels": self.channels,
            "startTime": self.start_time,
            "endTime": self.end_time,
            "hasFiltered": self.filtered is not None,
            "intermediates": list(self.intermediates.keys()),
        }

    def filtered_map(self, request_channels: List[int], start: int, end: int) -> Dict[int, np.ndarray]:
        if self.filtered is None:
            return {}
        if start < self.start_time or end > self.end_time:
            return {}
        offset_start = start - self.start_time
        offset_end = end - self.start_time
        channel_map: Dict[int, np.ndarray] = {}
        for idx, channel in enumerate(self.channels):
            if channel in request_channels:
                channel_map[channel] = self.filtered[idx, offset_start:offset_end]
        return channel_map


@dataclass
class SpikeSortingJob:
    """Tracks the state of a background algorithm execution."""

    id: str
    algorithm: str
    params: Dict[str, Any]
    channels: List[int]
    start_time: int
    end_time: int
    status: str = "queued"
    error: Optional[str] = None
    result: Optional[JobResult] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    _future: Optional[Future] = field(default=None, repr=False, compare=False)

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "id": self.id,
            "algorithm": self.algorithm,
            "params": self.params,
            "channels": self.channels,
            "startTime": self.start_time,
            "endTime": self.end_time,
            "status": self.status,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }
        if self.error:
            payload["error"] = self.error
        if self.result:
            payload["result"] = self.result.to_summary()
        return payload


class SpikeSortingJobManager:
    """Schedules and tracks spike sorting jobs executed in the background."""

    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._jobs: Dict[str, SpikeSortingJob] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Job lifecycle helpers
    # ------------------------------------------------------------------
    def start_job(
        self,
        algorithm_name: str,
        data_provider: Callable[[], Tuple[List[int], np.ndarray]],
        params: Optional[Dict[str, Any]] = None,
        window: Tuple[int, int] = (0, 0),
    ) -> SpikeSortingJob:
        spec = algorithm_registry.ensure_algorithm(algorithm_name)
        job_id = str(uuid.uuid4())
        params = params or {}
        channels: List[int] = []
        start_time, end_time = window

        job = SpikeSortingJob(
            id=job_id,
            algorithm=algorithm_name,
            params=params,
            channels=channels,
            start_time=start_time,
            end_time=end_time,
        )

        def _data_provider() -> Tuple[List[int], np.ndarray]:
            fetched_channels, block = data_provider()
            job.channels = fetched_channels
            return fetched_channels, block

        with self._lock:
            self._jobs[job_id] = job

        future = self._executor.submit(self._execute_job, job, spec, _data_provider)
        job._future = future
        future.add_done_callback(lambda _: self._finalise_job(job_id))
        return job

    def _execute_job(
        self,
        job: SpikeSortingJob,
        spec: AlgorithmSpec,
        data_provider: Callable[[], Tuple[List[int], np.ndarray]],
    ) -> None:
        job.status = "running"
        job.updated_at = time.time()
        try:
            channels, block = data_provider()
            result = spec.run(block.copy(), job.params)
            job.result = JobResult(
                job_id=job.id,
                channels=channels,
                start_time=job.start_time,
                end_time=job.end_time,
                raw=block,
                filtered=result.filtered,
                intermediates=result.intermediates,
            )
            job.status = "completed"
        except AlgorithmUnavailable as exc:
            job.status = "failed"
            job.error = str(exc)
        except Exception as exc:  # pragma: no cover - safety net
            job.status = "failed"
            job.error = str(exc)
        finally:
            job.updated_at = time.time()

    def _finalise_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if job._future and job._future.done():
                job._future = None
            job.updated_at = time.time()

    def get_job(self, job_id: str) -> Optional[SpikeSortingJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> List[SpikeSortingJob]:
        with self._lock:
            return list(self._jobs.values())

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.status in {"completed", "failed"}:
                return False
            if job._future and not job._future.done():
                cancelled = job._future.cancel()
                if cancelled:
                    job.status = "cancelled"
                    job.updated_at = time.time()
                return cancelled
            job.status = "cancelled"
            job.updated_at = time.time()
            return True


job_manager = SpikeSortingJobManager()
