import bpy
import os

def create_scene():
    # Clear existing mesh objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    
    # 1. Create a Floor (Mesh)
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    floor_obj = bpy.context.active_object
    floor_obj.name = "ConcreteFloor"
    
    # Create Floor Material
    floor_mat = bpy.data.materials.new(name="concrete_rough")
    floor_mat.diffuse_color = (0.5, 0.5, 0.5, 1.0)
    floor_obj.data.materials.append(floor_mat)
    
    # Add to Floors Collection
    floors_col = bpy.data.collections.new("Floors")
    bpy.context.scene.collection.children.link(floors_col)
    floors_col.objects.link(floor_obj)
    # Unlink from main collection
    if floor_obj.name in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.unlink(floor_obj)
    
    # 2. Create a Wooden Table (Mesh)
    bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 0.75))
    table_obj = bpy.context.active_object
    table_obj.name = "OakTable"
    
    # Create Table Material
    table_mat = bpy.data.materials.new(name="wood_oak")
    table_mat.diffuse_color = (0.6, 0.4, 0.2, 1.0)
    table_obj.data.materials.append(table_mat)
    
    # Add to Furniture Collection
    furniture_col = bpy.data.collections.new("Furniture")
    bpy.context.scene.collection.children.link(furniture_col)
    furniture_col.objects.link(table_obj)
    if table_obj.name in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.unlink(table_obj)
    
    # 3. Create Glass Window (Mesh)
    bpy.ops.mesh.primitive_plane_add(size=2, location=(3, 0, 1.5))
    glass_obj = bpy.context.active_object
    glass_obj.name = "GlassPane.001"
    glass_obj.rotation_euler = (0, 1.57, 0) # Rotate upright
    
    # Create Glass Material
    glass_mat = bpy.data.materials.new(name="glass_clear")
    glass_mat.diffuse_color = (0.8, 0.9, 1.0, 0.3)
    glass_obj.data.materials.append(glass_mat)
    
    # Add to Windows Collection
    windows_col = bpy.data.collections.new("Windows")
    bpy.context.scene.collection.children.link(windows_col)
    windows_col.objects.link(glass_obj)
    if glass_obj.name in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.unlink(glass_obj)
    
    # Save the file
    output_path = os.path.join(os.getcwd(), "sample_model.blend")
    bpy.ops.wm.save_as_mainfile(filepath=output_path)
    print(f"Created test blend file at: {output_path}")

create_scene()
