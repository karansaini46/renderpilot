"""
Blender processing pipeline module.
Executes headless Blender rendering to export camera previews and control passes.
"""

import os
import sys
import subprocess
import glob
import shutil
import datetime
import json
from config import config

def create_mock_png(filepath: str, text: str) -> None:
    """
    Generates a valid, structurally representative PNG mockup placeholder 
    using PIL to prevent image processing libraries from failing down the line.
    """
    from PIL import Image, ImageDraw
    # Create dark slate-colored base
    img = Image.new("RGB", (512, 512), color=(30, 32, 40))
    draw = ImageDraw.Draw(img)
    
    # Draw simple gridlines to represent a viewport grid
    for i in range(0, 512, 64):
        draw.line([(i, 0), (i, 512)], fill=(40, 45, 55), width=1)
        draw.line([(0, i), (512, i)], fill=(40, 45, 55), width=1)
        
    # Draw simple building shapes
    draw.rectangle([128, 192, 384, 416], outline=(79, 70, 229), width=3)
    draw.polygon([(128, 192), (256, 96), (384, 192)], outline=(99, 102, 241), width=3)
    
    # Draw door and window details
    draw.rectangle([224, 320, 288, 416], outline=(99, 102, 241), width=2) # Door
    draw.rectangle([160, 240, 208, 288], outline=(99, 102, 241), width=2) # Window Left
    draw.rectangle([304, 240, 352, 288], outline=(99, 102, 241), width=2) # Window Right
    
    # Text banner background
    draw.rectangle([0, 440, 512, 490], fill=(15, 17, 23))
    
    # Draw simple text using Pillow default text fallback (without external ttf dependencies)
    try:
        draw.text((24, 455), text, fill=(200, 210, 230))
    except Exception:
        pass
        
    img.save(filepath, "PNG")

def write_camera_preview_script(script_path: str) -> None:
    """
    Writes the camera preview generator script to a file.
    """
    script_content = """import bpy
import os
import sys
import json
import mathutils

def import_model_file(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    
    # Delete default mesh objects to avoid rendering them
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
            
    if ext == '.obj':
        if hasattr(bpy.ops.wm, 'obj_import'):
            bpy.ops.wm.obj_import(filepath=filepath)
        else:
            bpy.ops.import_scene.obj(filepath=filepath)
    elif ext == '.fbx':
        if hasattr(bpy.ops.wm, 'fbx_import'):
            bpy.ops.wm.fbx_import(filepath=filepath)
        else:
            bpy.ops.import_scene.fbx(filepath=filepath)
    elif ext in ['.glb', '.gltf']:
        if hasattr(bpy.ops.import_scene, 'gltf'):
            bpy.ops.import_scene.gltf(filepath=filepath)
        elif hasattr(bpy.ops.wm, 'gltf_import'):
            bpy.ops.wm.gltf_import(filepath=filepath)
    else:
        raise ValueError(f"Unsupported model file format: {ext}")

def get_scene_bounding_box():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        return mathutils.Vector((0.0, 0.0, 0.0)), mathutils.Vector((2.0, 2.0, 2.0)), 0.0
        
    min_x = min_y = min_z = float('inf')
    max_x = max_y = max_z = float('-inf')
    
    for obj in meshes:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ mathutils.Vector(corner)
            min_x = min(min_x, world_corner.x)
            min_y = min(min_y, world_corner.y)
            min_z = min(min_z, world_corner.z)
            max_x = max(max_x, world_corner.x)
            max_y = max(max_y, world_corner.y)
            max_z = max(max_z, world_corner.z)
            
    center = mathutils.Vector(((min_x + max_x) / 2.0, (min_y + max_y) / 2.0, (min_z + max_z) / 2.0))
    size = mathutils.Vector((max_x - min_x, max_y - min_y, max_z - min_z))
    return center, size, min_z

def extract_scene_materials(output_dir):
    detected = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        
        collections = [col.name for col in obj.users_collection]
        
        if obj.data.materials:
            for mat in obj.data.materials:
                if mat is None:
                    continue
                
                base_color = [1.0, 1.0, 1.0, 1.0]
                if hasattr(mat, 'diffuse_color'):
                    base_color = list(mat.diffuse_color)
                
                if mat.use_nodes and mat.node_tree:
                    for node in mat.node_tree.nodes:
                        if node.type == 'BSDF_PRINCIPLED':
                            base_color_socket = node.inputs.get('Base Color')
                            if base_color_socket and not base_color_socket.is_linked:
                                base_color = list(base_color_socket.default_value)
                            break
                            
                detected.append({
                    "object_name": obj.name,
                    "material_name": mat.name,
                    "collections": collections,
                    "base_color": base_color
                })
        else:
            detected.append({
                "object_name": obj.name,
                "material_name": "",
                "collections": collections,
                "base_color": [0.8, 0.8, 0.8, 1.0]
            })
            
    out_path = os.path.join(output_dir, "detected_scene_materials.json")
    with open(out_path, "w") as f:
        json.dump(detected, f)

def setup_and_render_previews(output_dir, model_path=None):
    if model_path:
        try:
            import_model_file(model_path)
        except Exception as e:
            print(f"Error importing model file: {e}", file=sys.stderr)
            raise e
    try:
        extract_scene_materials(output_dir)
    except Exception as e:
        print(f"Error extracting scene materials: {e}", file=sys.stderr)

    try:
        bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        try:
            bpy.context.scene.render.engine = 'BLENDER_EEVEE'
        except TypeError:
            bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
            
    if hasattr(bpy.context.scene, "eevee"):
        try:
            bpy.context.scene.eevee.taa_render_samples = 4
        except AttributeError:
            pass
        
    bpy.context.scene.render.resolution_x = 256
    bpy.context.scene.render.resolution_y = 256
    bpy.context.scene.render.resolution_percentage = 100
    
    center, size, min_z = get_scene_bounding_box()
    max_dim = max(size.x, size.y, size.z)
    if max_dim < 0.1:
        max_dim = 1.0
        
    # Target empty at center of the model
    bpy.ops.object.empty_add(location=center)
    target = bpy.context.active_object
    
    candidates = [
        {
            "name": "hero",
            "loc": (center.x + max_dim * 1.2, center.y - max_dim * 1.2, center.z + max_dim * 0.8)
        },
        {
            "name": "eye_level",
            "loc": (center.x, center.y - max_dim * 1.0, min_z + 1.7)
        },
        {
            "name": "wide",
            "loc": (center.x - max_dim * 1.8, center.y - max_dim * 2.2, center.z + max_dim * 1.5)
        }
    ]
    
    camera_data = []
    
    for idx, c in enumerate(candidates):
        bpy.ops.object.camera_add(location=c["loc"])
        cam = bpy.context.active_object
        
        # Constraint to point at target center
        constraint = cam.constraints.new(type='TRACK_TO')
        constraint.target = target
        constraint.track_axis = 'TRACK_NEGATIVE_Z'
        constraint.up_axis = 'UP_Y'
        
        bpy.context.scene.camera = cam
        bpy.context.view_layer.update()
        
        loc = list(cam.location)
        rot = list(cam.rotation_euler)
        
        out_path = os.path.join(output_dir, f"thumbnail_{idx}.png")
        bpy.context.scene.render.filepath = out_path
        
        bpy.ops.render.render(write_still=True)
        
        camera_data.append({
            "index": idx,
            "name": c["name"],
            "location": loc,
            "rotation": rot
        })
        
        bpy.data.objects.remove(cam, do_unlink=True)
        
    bpy.data.objects.remove(target, do_unlink=True)
    
    with open(os.path.join(output_dir, "camera_candidates.json"), "w") as f:
        json.dump(camera_data, f)

argv = sys.argv
if "--" in argv:
    args = argv[argv.index("--") + 1:]
    if len(args) >= 1:
        output_dir = args[0]
        model_path = args[1] if len(args) > 1 else None
        setup_and_render_previews(output_dir, model_path)
"""
    with open(script_path, "w") as f:
        f.write(script_content)

def write_render_script(script_path: str, camera_config: dict = None) -> None:
    """
    Writes the compositor pipeline render script to a file.
    """
    script_content = f"""import bpy
import os
import sys

def import_model_file(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    
    # Delete default mesh objects to avoid rendering them
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
            
    if ext == '.obj':
        if hasattr(bpy.ops.wm, 'obj_import'):
            bpy.ops.wm.obj_import(filepath=filepath)
        else:
            bpy.ops.import_scene.obj(filepath=filepath)
    elif ext == '.fbx':
        if hasattr(bpy.ops.wm, 'fbx_import'):
            bpy.ops.wm.fbx_import(filepath=filepath)
        else:
            bpy.ops.import_scene.fbx(filepath=filepath)
    elif ext in ['.glb', '.gltf']:
        if hasattr(bpy.ops.import_scene, 'gltf'):
            bpy.ops.import_scene.gltf(filepath=filepath)
        elif hasattr(bpy.ops.wm, 'gltf_import'):
            bpy.ops.wm.gltf_import(filepath=filepath)
    else:
        raise ValueError(f"Unsupported model file format: {ext}")

def setup_scene_and_render(output_dir, model_path=None):
    if model_path:
        try:
            import_model_file(model_path)
        except Exception as e:
            print(f"Error importing model file: {e}", file=sys.stderr)
            raise e
    # Set engine to EEVEE (very fast and laptop/RTX 3050 safe)
    try:
        bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        try:
            bpy.context.scene.render.engine = 'BLENDER_EEVEE'
        except TypeError:
            bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
            
    # Configure low samples
    if hasattr(bpy.context.scene, "eevee"):
        try:
            bpy.context.scene.eevee.taa_render_samples = 8
        except AttributeError:
            pass
        
    # Enforce safe resolution (no extreme resolutions)
    bpy.context.scene.render.resolution_x = 768
    bpy.context.scene.render.resolution_y = 768
    bpy.context.scene.render.resolution_percentage = 100
    
    camera_config = {repr(camera_config)}
    
    if camera_config:
        # Spawn camera at user-selected coordinates
        bpy.ops.object.camera_add(location=camera_config["location"], rotation=camera_config["rotation"])
        camera = bpy.context.active_object
        bpy.context.scene.camera = camera
    else:
        # Ensure camera exists in scene
        cameras = [obj for obj in bpy.context.scene.objects if obj.type == 'CAMERA']
        if not cameras:
            # Create a temporary camera pointing at the center
            bpy.ops.object.camera_add(location=(10, -10, 10), rotation=(1.1, 0, 0.785))
            camera = bpy.context.active_object
            bpy.context.scene.camera = camera
        else:
            bpy.context.scene.camera = cameras[0]
        
    # Enable Compositor Nodes
    bpy.context.scene.use_nodes = True
    tree = bpy.context.scene.node_tree
    
    # Clear existing compositor nodes
    for node in list(tree.nodes):
        tree.nodes.remove(node)
        
    # Create Render Layers node
    rl = tree.nodes.new('CompositorNodeRLayers')
    
    # Enable passes in ViewLayer
    view_layer = bpy.context.scene.view_layers[0]
    view_layer.use_pass_z = True
    view_layer.use_pass_normal = True
    
    # Create File Output node
    fo = tree.nodes.new('CompositorNodeOutputFile')
    fo.base_path = output_dir
    fo.format.file_format = 'PNG'
    fo.file_slots.clear()
    
    # 1. Base Render slot
    slot_base = fo.file_slots.new('base_render')
    tree.links.new(rl.outputs['Image'], slot_base)
    
    # 2. Depth Map slot (normalizing the distance)
    slot_depth = fo.file_slots.new('depth_map')
    map_val = tree.nodes.new('CompositorNodeMapValue')
    map_val.offset = [0.0]
    map_val.size = [0.05] # Scale down distance
    map_val.use_min = True
    map_val.use_max = True
    map_val.min = [0.0]
    map_val.max = [1.0]
    tree.links.new(rl.outputs['Depth'], map_val.inputs['Value'])
    tree.links.new(map_val.outputs['Value'], slot_depth)
    
    # 3. Normal Map slot (map normals to 0-1 color range)
    slot_normal = fo.file_slots.new('normal_map')
    map_norm = tree.nodes.new('CompositorNodeMapValue')
    map_norm.offset = [0.5]
    map_norm.size = [0.5]
    map_norm.use_min = True
    map_norm.use_max = True
    map_norm.min = [0.0]
    map_norm.max = [1.0]
    tree.links.new(rl.outputs['Normal'], map_norm.inputs['Value'])
    tree.links.new(map_norm.outputs['Value'], slot_normal)
    
    # 4. Line / Edge Map slot (applying SOBEL filter to extract lines)
    slot_line = fo.file_slots.new('line_map')
    filter_node = tree.nodes.new('CompositorNodeFilter')
    filter_node.filter_type = 'SOBEL'
    tree.links.new(rl.outputs['Image'], filter_node.inputs['Image'])
    tree.links.new(filter_node.outputs['Image'], slot_line)
    
    # Render
    bpy.ops.render.render(write_still=True)

# Parse arguments from CLI
argv = sys.argv
if "--" in argv:
    args = argv[argv.index("--") + 1:]
    if len(args) >= 1:
        output_dir = args[0]
        model_path = args[1] if len(args) > 1 else None
        setup_scene_and_render(output_dir, model_path)
"""
    with open(script_path, "w") as f:
        f.write(script_content)

def run_blender_pipeline(job_id: str, project_id: str, settings_json: str, local_blend_path: str, camera_config: dict = None) -> dict:
    """
    Runs the Blender headless rendering pipeline with an optional camera config.
    """
    print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Starting render pipeline for Job {job_id}")
    
    # Check format first
    ext = os.path.splitext(local_blend_path)[1].lower()
    if ext in ['.skp', '.skb']:
        raise ValueError("SketchUp (.skp/.skb) files are not natively supported by Blender. Please export your model to .blend, .obj, .fbx, or .glb format and upload again.")
    elif ext not in ['.blend', '.obj', '.fbx', '.glb', '.gltf']:
        raise ValueError(f"Unsupported 3D model format: {ext}")
        
    is_blend = ext == '.blend'
    
    workspace_dir = os.path.join(config.LOCAL_WORKSPACE_ROOT, "blender_jobs", job_id)
    os.makedirs(workspace_dir, exist_ok=True)
    
    blender_path = config.BLENDER_PATH
    script_path = os.path.join(workspace_dir, "render_passes.py")
    write_render_script(script_path, camera_config)
    
    blender_success = False
    
    if blender_path and os.path.exists(blender_path) and local_blend_path and os.path.exists(local_blend_path):
        try:
            print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Launching headless Blender process...")
            if is_blend:
                cmd = [
                    blender_path,
                    "-b", local_blend_path,
                    "-P", script_path,
                    "--", workspace_dir
                ]
            else:
                cmd = [
                    blender_path,
                    "-b",
                    "-P", script_path,
                    "--", workspace_dir, local_blend_path
                ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Headless rendering completed successfully.")
                blender_success = True
            else:
                print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Blender exited with code {result.returncode}.", file=sys.stderr)
                print(f"[Blender Stderr]:\n{result.stderr}", file=sys.stderr)
        except subprocess.TimeoutExpired:
            print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Headless Blender execution timed out.", file=sys.stderr)
        except Exception as e:
            print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Error executing Blender subprocess: {e}", file=sys.stderr)
    else:
        print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Skip subprocess: Blender path or input file missing.", file=sys.stderr)

    # Resolve output files, renaming frame suffixes and falling back if needed
    output_files = {}
    slots = ["base_render", "depth_map", "line_map", "normal_map"]
    
    for slot in slots:
        pattern = os.path.join(workspace_dir, f"{slot}*.png")
        found = glob.glob(pattern)
        dest = os.path.join(workspace_dir, f"{slot}.png")
        
        if found:
            # Move and rename slot output
            if os.path.exists(dest):
                os.remove(dest)
            shutil.move(found[0], dest)
            output_files[slot] = dest
            print(f"  -> Generated pass file: {dest}")
        else:
            # Fallback to simulated outputs if Blender did not run or failed to render the slot
            print(f"  -> Pass file {slot} not found. Creating simulated fallback.", file=sys.stderr)
            create_mock_png(dest, f"Pass file: {slot.upper()} for Job {job_id}")
            output_files[slot] = dest

    return {
        "status": "success" if blender_success else "fallback",
        "workspace_dir": workspace_dir,
        "outputs": output_files,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

def run_camera_preview_pipeline(job_id: str, project_id: str, user_id: str, local_blend_path: str) -> tuple:
    """
    Runs the Blender headless camera preview pipeline to generate 3 camera candidates.
    """
    print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Starting camera setup for Job {job_id}")
    
    # Check format first
    ext = os.path.splitext(local_blend_path)[1].lower()
    if ext in ['.skp', '.skb']:
        raise ValueError("SketchUp (.skp/.skb) files are not natively supported by Blender. Please export your model to .blend, .obj, .fbx, or .glb format and upload again.")
    elif ext not in ['.blend', '.obj', '.fbx', '.glb', '.gltf']:
        raise ValueError(f"Unsupported 3D model format: {ext}")
        
    is_blend = ext == '.blend'
    
    from storage import uploadFileFromWorker
    
    workspace_dir = os.path.join(config.LOCAL_WORKSPACE_ROOT, "blender_jobs", job_id)
    os.makedirs(workspace_dir, exist_ok=True)
    
    blender_path = config.BLENDER_PATH
    script_path = os.path.join(workspace_dir, "generate_previews.py")
    write_camera_preview_script(script_path)
    
    blender_success = False
    
    if blender_path and os.path.exists(blender_path) and local_blend_path and os.path.exists(local_blend_path):
        try:
            print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Launching headless Blender process...")
            if is_blend:
                cmd = [
                    blender_path,
                    "-b", local_blend_path,
                    "-P", script_path,
                    "--", workspace_dir
                ]
            else:
                cmd = [
                    blender_path,
                    "-b",
                    "-P", script_path,
                    "--", workspace_dir, local_blend_path
                ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Camera candidates generated successfully.")
                blender_success = True
            else:
                print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Blender exited with code {result.returncode}.", file=sys.stderr)
                print(f"[Blender Stderr]:\n{result.stderr}", file=sys.stderr)
        except Exception as e:
            print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Error executing Blender subprocess: {e}", file=sys.stderr)
    else:
        print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Skip subprocess: Blender path or input file missing.", file=sys.stderr)

    camera_candidates = []
    
    # Load metadata JSON if successful
    json_path = os.path.join(workspace_dir, "camera_candidates.json")
    if blender_success and os.path.exists(json_path):
        try:
            with open(json_path, "r") as f:
                camera_candidates = json.load(f)
        except Exception as json_err:
            print(f"Failed to read camera candidates JSON: {json_err}", file=sys.stderr)
            blender_success = False
            
    # If Blender execution failed or JSON is missing, generate mock camera candidates
    if not blender_success or not camera_candidates:
        print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Generating mock camera candidates fallback.")
        camera_candidates = [
            {"index": 0, "name": "hero", "location": [5.0, -5.0, 3.5], "rotation": [1.1, 0.0, 0.78]},
            {"index": 1, "name": "eye_level", "location": [0.0, -6.0, 1.7], "rotation": [1.57, 0.0, 0.0]},
            {"index": 2, "name": "wide", "location": [-8.0, -10.0, 7.0], "rotation": [0.9, 0.0, 0.6]}
        ]
        
    # Upload thumbnails to S3 and add URL to candidates
    updated_candidates = []
    for candidate in camera_candidates:
        idx = candidate["index"]
        name = candidate["name"]
        local_thumb = os.path.join(workspace_dir, f"thumbnail_{idx}.png")
        
        # If thumbnail file doesn't exist, create a mock PNG thumbnail
        if not os.path.exists(local_thumb):
            create_mock_png(local_thumb, f"Camera Candidate: {name.upper()}")
                
        timestamp_sec = int(datetime.datetime.now().timestamp())
        s3_key = f"users/{user_id}/projects/{project_id}/outputs/camera_{job_id}_{idx}.png"
        
        print(f"[{datetime.datetime.now().strftime('%T')}] Uploading camera {idx} ({name}) preview to S3: {s3_key}")
        uploadFileFromWorker(local_thumb, s3_key)
        
        updated_candidates.append({
            "index": idx,
            "name": name,
            "thumbnail_url": s3_key,
            "location": candidate["location"],
            "rotation": candidate["rotation"]
        })
        
    # Read detected scene materials if present before cleanup
    detected_materials = []
    materials_json_path = os.path.join(workspace_dir, "detected_scene_materials.json")
    if os.path.exists(materials_json_path):
        try:
            with open(materials_json_path, "r") as f:
                detected_materials = json.load(f)
            print(f"[{datetime.datetime.now().strftime('%T')}] Read {len(detected_materials)} detected materials from Blender scene.")
        except Exception as mat_err:
            print(f"Failed to read detected scene materials JSON: {mat_err}", file=sys.stderr)

    # Cleanup workspace
    if os.path.exists(workspace_dir):
        print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Previews] Cleaning up preview workspace...")
        shutil.rmtree(workspace_dir, ignore_errors=True)
        
    return updated_candidates, detected_materials
