import sys
import os

# Add apps/worker to path so we can import
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "apps", "worker"))

from main import detect_material_class, get_default_finish

def test_heuristics():
    test_cases = [
        # (obj_name, mat_name, collections, base_color, expected_class, min_confidence)
        ("GlassPane.001", "Material", ["Facade", "Windows"], [0.9, 0.9, 0.9, 1.0], "glass", 0.70),
        ("OakTable", "wood_oak", ["Furniture"], [0.5, 0.4, 0.3, 1.0], "furniture", 0.80),
        ("WoodPlank", "wood_oak", ["Planks"], [0.5, 0.4, 0.3, 1.0], "wood", 0.90),
        ("SteelBeam", "Material.002", ["Structure"], [0.8, 0.8, 0.8, 1.0], "metal", 0.75),
        ("GrassPatch", "Material", ["Landscape"], [0.2, 0.7, 0.2, 1.0], "vegetation", 0.60), # green color hue
        ("WallWest", "plaster_white", ["Walls"], [0.9, 0.9, 0.9, 1.0], "wall", 0.80),
        ("ConcreteFloor", "concrete_rough", ["Floors"], [0.5, 0.5, 0.5, 1.0], "floor", 0.80),
        ("LimestonePaving", "stone_limestone", ["Floors"], [0.7, 0.7, 0.6, 1.0], "floor", 0.70),
        ("RoofGable", "shingles_dark", ["Roofing"], [0.2, 0.2, 0.2, 1.0], "roof", 0.70),
        ("DoorMain", "wood_door", ["Entrance"], [0.4, 0.3, 0.2, 1.0], "door", 0.85),
        ("WindowFrameEast", "aluminum_black", ["Frames"], [0.1, 0.1, 0.1, 1.0], "frame", 0.70),
        ("ChairDining", "leather_brown", ["Furniture"], [0.3, 0.2, 0.1, 1.0], "furniture", 0.75)
    ]
    
    passed = 0
    for idx, (obj_name, mat_name, collections, base_color, expected_class, min_conf) in enumerate(test_cases):
        det_class, conf, reason = detect_material_class(obj_name, mat_name, collections, base_color)
        print(f"Test case {idx+1}: Obj: {obj_name}, Mat: {mat_name} -> Detected: {det_class} (Conf: {conf:.2f}), Reason: {reason}")
        assert det_class == expected_class, f"Expected {expected_class}, got {det_class}"
        assert conf >= min_conf, f"Expected confidence >= {min_conf}, got {conf}"
        passed += 1
        
    print(f"\nAll {passed} heuristic test cases passed successfully!")

if __name__ == "__main__":
    test_heuristics()
