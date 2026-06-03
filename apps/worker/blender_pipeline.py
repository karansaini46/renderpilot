"""
Blender processing pipeline module.
Executes headless Blender rendering to export control passes:
- Base render
- Depth map
- Line map
- Normal map
"""

import os
import sys
import subprocess
import glob
import shutil
import datetime
from config import config

def write_render_script(script_path: str) -> None:
    """
    Writes the compositor pipeline render script to a file.
    """
    script_content = """import bpy
import os
import sys

def setup_scene_and_render(output_dir):
    # Set engine to EEVEE (very fast and laptop/RTX 3050 safe)
    bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    
    # Configure low samples
    if hasattr(bpy.context.scene, "eevee"):
        bpy.context.scene.eevee.taa_render_samples = 8
        
    # Enforce safe resolution (no extreme resolutions)
    bpy.context.scene.render.resolution_x = 768
    bpy.context.scene.render.resolution_y = 768
    bpy.context.scene.render.resolution_percentage = 100
    
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
    fo.file_format = 'PNG'
    fo.layer_slots.clear()
    
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
    tree.links.new(rl.outputs['Image'], filter_node.inputs['Value'])
    tree.links.new(filter_node.outputs['Value'], slot_line)
    
    # Render
    bpy.ops.render.render(write_still=True)

# Parse arguments from CLI
argv = sys.argv
if "--" in argv:
    args = argv[argv.index("--") + 1:]
    if len(args) >= 1:
        setup_scene_and_render(args[0])
"""
    with open(script_path, "w") as f:
        f.write(script_content)

def run_blender_pipeline(job_id: str, project_id: str, settings_json: str, local_blend_path: str) -> dict:
    """
    Runs the Blender headless rendering pipeline.
    """
    print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Starting render pipeline for Job {job_id}")
    
    workspace_dir = os.path.join(config.LOCAL_WORKSPACE_ROOT, "blender_jobs", job_id)
    os.makedirs(workspace_dir, exist_ok=True)
    
    blender_path = config.BLENDER_PATH
    script_path = os.path.join(workspace_dir, "render_passes.py")
    write_render_script(script_path)
    
    blender_success = False
    
    if blender_path and os.path.exists(blender_path) and local_blend_path and os.path.exists(local_blend_path):
        try:
            print(f"[{datetime.datetime.now().strftime('%T')}] [Blender Pipeline] Launching headless Blender process...")
            cmd = [
                blender_path,
                "-b", local_blend_path,
                "-P", script_path,
                "--", workspace_dir
            ]
            # Execute with a timeout to avoid hanging processes on laptop hardware
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
            # Fallback to simulated outputs if Blender did not run or fail to render the slot
            print(f"  -> Pass file {slot} not found. Creating simulated fallback.", file=sys.stderr)
            with open(dest, "w") as f:
                f.write(f"SIMULATED_BLENDER_PASS_OUTPUT: {slot.upper()} for Job {job_id}")
            output_files[slot] = dest

    return {
        "status": "success" if blender_success else "fallback",
        "workspace_dir": workspace_dir,
        "outputs": output_files,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
