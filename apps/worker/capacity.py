"""
Capacity guardrails for private laptop worker nodes.

Defines a default laptop profile with safe resource limits and provides
a downshift function that clamps incoming job settings to within those
limits before processing begins.
"""

import json
import copy

# Default laptop hardware profile — conservative limits
# that prevent VRAM exhaustion and thermal throttling on consumer GPUs.
# 4GB VRAM profile — SD 1.5 only, no SDXL
LAPTOP_PROFILE = {
    "max_concurrent_jobs": 1,
    "max_preview_resolution": 768,
    "max_resolution": 768,
    "max_steps": 25,
    "default_cfg": 8.0,
    "default_sampler": "dpmpp_2m",
    "default_scheduler": "karras",
    "max_variations_per_job": 4,
    "sequential_variations": True,
    "sdxl_enabled": False,
    "video_enabled": False,
    "parallel_comfyui_jobs": 1,
    "upscale_approved_only": True,
}


def load_profile(overrides: dict | None = None) -> dict:
    """
    Returns the active capacity profile, merging any user-provided
    overrides on top of the laptop defaults. Keys not present in
    the override dict keep their default values.
    """
    profile = copy.deepcopy(LAPTOP_PROFILE)
    if overrides:
        for key in LAPTOP_PROFILE:
            if key in overrides:
                profile[key] = overrides[key]
    return profile


def downshift_job_settings(raw_settings: str | dict, profile: dict | None = None) -> tuple[dict, list[str]]:
    """
    Inspects the job settings payload and clamps any values that exceed
    the capacity profile. Returns (clamped_settings, list_of_adjustments).

    If adjustments were applied, each entry in the list is a human-readable
    message describing what was changed and why.

    If the profile itself cannot safely handle the job (e.g. SDXL or video
    requested on a laptop that disallows it), the adjustments list will
    contain a 'needs_review' flag entry prefixed with "[NEEDS_REVIEW]".
    """
    if profile is None:
        profile = LAPTOP_PROFILE

    if isinstance(raw_settings, str):
        try:
            settings = json.loads(raw_settings) if raw_settings.strip() else {}
        except (json.JSONDecodeError, AttributeError):
            settings = {}
    else:
        settings = copy.deepcopy(raw_settings)

    adjustments: list[str] = []

    # Resolution capping
    requested_resolution = settings.get("preview_resolution", 0)
    max_res = profile["max_preview_resolution"]
    if requested_resolution > max_res:
        adjustments.append(
            f"Preview resolution downshifted from {requested_resolution}px to {max_res}px "
            f"(laptop profile limit)."
        )
        settings["preview_resolution"] = max_res

    # Variation count capping
    requested_variations = settings.get("variations", 0)
    max_var = profile["max_variations_per_job"]
    if requested_variations > max_var:
        adjustments.append(
            f"Variation count reduced from {requested_variations} to {max_var} "
            f"(laptop profile limit)."
        )
        settings["variations"] = max_var

    # Step count capping
    requested_steps = settings.get("steps", 0)
    max_steps = profile.get("max_steps", 25)
    if requested_steps > max_steps:
        adjustments.append(
            f"Step count reduced from {requested_steps} to {max_steps} "
            f"(laptop profile limit)."
        )
        settings["steps"] = max_steps

    # Force sequential variation generation
    if profile["sequential_variations"]:
        if settings.get("parallel_variations", False):
            adjustments.append(
                "Parallel variation generation disabled; variations will run sequentially."
            )
            settings["parallel_variations"] = False

    # SDXL mode check
    if settings.get("sdxl_mode", False) and not profile["sdxl_enabled"]:
        adjustments.append(
            "[NEEDS_REVIEW] SDXL mode requested but is disabled on this laptop profile. "
            "Job requires manual approval or a workstation-class node."
        )
        settings["sdxl_mode"] = False

    # Video mode check
    if settings.get("video_mode", False) and not profile["video_enabled"]:
        adjustments.append(
            "[NEEDS_REVIEW] Video rendering requested but is disabled on this laptop profile. "
            "Job requires manual approval or a workstation-class node."
        )
        settings["video_mode"] = False

    # Parallel ComfyUI jobs
    if settings.get("parallel_comfyui", False) and not profile["parallel_comfyui_jobs"]:
        adjustments.append(
            "Parallel ComfyUI jobs disabled; only one ComfyUI workflow runs at a time."
        )
        settings["parallel_comfyui"] = False

    # Upscale policy
    if settings.get("upscale_all", False) and profile["upscale_approved_only"]:
        adjustments.append(
            "Bulk upscale disabled; only approved or selected images will be upscaled."
        )
        settings["upscale_all"] = False

    return settings, adjustments


def requires_review(adjustments: list[str]) -> bool:
    """
    Returns True if any adjustment entry is flagged as needing manual review.
    """
    return any(a.startswith("[NEEDS_REVIEW]") for a in adjustments)
