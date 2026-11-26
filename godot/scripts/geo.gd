## Small helpers for building levels out of boxes (each box is drawn and, if solid, collides).
class_name Geo
extends RefCounted

static var _mats := {}

static func mat(color: Color, rough := 0.85, metal := 0.0) -> StandardMaterial3D:
	var key := "%s/%s/%s" % [color.to_html(), rough, metal]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color; m.roughness = rough; m.metallic = metal
	_mats[key] = m
	return m

## a box from corner a to corner b
static func box(parent: Node3D, a: Vector3, b: Vector3, material: Material, solid := true) -> MeshInstance3D:
	var lo := a.min(b); var hi := a.max(b); var size := hi - lo; var center := (lo + hi) / 2.0
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new(); bm.size = size; mi.mesh = bm; mi.material_override = material
	mi.position = center
	parent.add_child(mi)
	if solid:
		var sb := StaticBody3D.new(); var cs := CollisionShape3D.new(); var sh := BoxShape3D.new()
		sh.size = size; cs.shape = sh; sb.add_child(cs); sb.position = center
		parent.add_child(sb)
	return mi
