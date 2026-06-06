import sys
from pathlib import Path

# Add the apps/worker directory to sys.path so we can import comfyui_client
sys.path.append(str(Path(__file__).parent))

from comfyui_client import ComfyUIClient


def get_mock_workflow():
    return {
        "1": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 0,
                "steps": 0,
                "cfg": 0.0,
                "denoise": 0.0
            }
        },
        "2": {
            "class_type": "ControlNetApply",
            "inputs": {
                "strength": 0.0
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "_meta": {
                "title": "Positive Prompt Encoder"
            },
            "inputs": {
                "text": ""
            }
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "_meta": {
                "title": "Negative Prompt"
            },
            "inputs": {
                "text": ""
            }
        }
    }


def test_respect_explicit_denoise():
    print("--- Test 1: Respecting Explicit Denoise (e.g. 0.27) ---")
    client = ComfyUIClient(base_url="http://localhost:8188", workflows_dir=".")
    
    # Test for technical mode with explicit denoise 0.27
    workflow = get_mock_workflow()
    result = client.inject_parameters(
        workflow=workflow,
        prompt="beautiful room",
        negative_prompt="blurry",
        denoise=0.27,
        geometry_lock_mode="technical",
        prompt_brain_provider="gemini"
    )
    
    injected_denoise = result["1"]["inputs"]["denoise"]
    control_strength = result["2"]["inputs"]["strength"]
    positive_text = result["3"]["inputs"]["text"]
    
    print(f"Injected denoise: {injected_denoise} (expected 0.27)")
    print(f"Control Strength: {control_strength} (expected 1.0)")
    print(f"Positive prompt: {positive_text}")
    
    assert injected_denoise == 0.27, f"Expected denoise to be 0.27, got {injected_denoise}"
    assert control_strength == 1.0, f"Expected control strength to be 1.0 for technical mode, got {control_strength}"
    assert "beautiful room" in positive_text
    assert "strongest preservation" in positive_text
    print("-> Test 1 Passed!\n")


def test_fallback_denoise_defaults():
    print("--- Test 2: Fallback Denoise Defaults (when denoise is None) ---")
    client = ComfyUIClient(base_url="http://localhost:8188", workflows_dir=".")
    
    modes_to_test = {
        "strict_structure": {"expected_denoise": 0.32, "expected_strength": 1.0},
        "balanced_enhancement": {"expected_denoise": 0.38, "expected_strength": 0.75},
        "creative_concept": {"expected_denoise": 0.65, "expected_strength": 0.40},
    }
    
    for mode, expected in modes_to_test.items():
        workflow = get_mock_workflow()
        result = client.inject_parameters(
            workflow=workflow,
            prompt="room",
            negative_prompt="blurry",
            denoise=None,
            geometry_lock_mode=mode,
            prompt_brain_provider="manual"
        )
        
        injected_denoise = result["1"]["inputs"]["denoise"]
        control_strength = result["2"]["inputs"]["strength"]
        
        print(f"Mode: {mode} -> denoise={injected_denoise} (expected {expected['expected_denoise']}), control_strength={control_strength} (expected {expected['expected_strength']})")
        
        assert injected_denoise == expected["expected_denoise"], f"Expected {expected['expected_denoise']} for mode {mode}, got {injected_denoise}"
        assert control_strength == expected["expected_strength"], f"Expected {expected['expected_strength']} for mode {mode}, got {control_strength}"
        
    print("-> Test 2 Passed!\n")


if __name__ == "__main__":
    test_respect_explicit_denoise()
    test_fallback_denoise_defaults()
    print("All geometry lock and denoise unit tests passed successfully!")
