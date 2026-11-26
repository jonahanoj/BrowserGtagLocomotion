## Gorilla Tag locomotion: a port of Another Axiom's GorillaLocomotion Player.cs (MIT License,
## Copyright (c) 2021 Another-Axiom, https://github.com/Another-Axiom/GorillaLocomotion), the same
## algorithm the web version uses, with Godot's physics doing the sphere casts.
class_name GorillaLoco
extends RefCounted

const VELOCITY_HISTORY_SIZE := 8
const MAX_ARM_LENGTH := 1.5
const UNSTICK_DISTANCE := 1.0
const VELOCITY_LIMIT := 0.4
const MAX_JUMP_SPEED := 6.5
const JUMP_MULTIPLIER := 1.1
const MIN_RAYCAST_DISTANCE := 0.05
const DEFAULT_SLIDE_FACTOR := 0.03
const DEFAULT_PRECISION := 0.995
const HEAD_RADIUS := 0.15
const BODY_RADIUS := 0.15
const GRAVITY := 9.81
const FRICTION := 0.6

var rig: Node3D            # the XROrigin3D (Unity's "GorillaPlayer")
var head: Node3D           # XRCamera3D
var hands: Array = [null, null]   # XRController3D left, right
var space: PhysicsDirectSpaceState3D
var mask := 1
var gravity_scale := 1.0

var last_hand: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var last_head_position := Vector3.ZERO
var velocity := Vector3.ZERO
var velocity_history: Array[Vector3] = []
var velocity_index := 0
var denorm_avg := Vector3.ZERO
var last_position := Vector3.ZERO
var was_touching: Array[bool] = [false, false]
var disable_movement := false
var grounded := false

var _sphere := SphereShape3D.new()
var _q := PhysicsShapeQueryParameters3D.new()

func _init(p_rig: Node3D, p_head: Node3D, p_left: Node3D, p_right: Node3D) -> void:
	rig = p_rig; head = p_head; hands = [p_left, p_right]
	_q.shape = _sphere
	_q.margin = 0.0

func head_pos() -> Vector3: return head.global_position
func hand_pos(i: int) -> Vector3: return hands[i].global_position

func initialize_values() -> void:
	velocity_history.clear()
	for i in VELOCITY_HISTORY_SIZE: velocity_history.append(Vector3.ZERO)
	last_hand[0] = hand_pos(0); last_hand[1] = hand_pos(1)
	last_head_position = head_pos(); velocity_index = 0; last_position = rig.global_position
	denorm_avg = Vector3.ZERO; velocity = Vector3.ZERO; was_touching.assign([false, false])

# ---- Unity Physics.SphereCast / Raycast. Like Unity, colliders that already overlap the start are ignored.
func raycast(o: Vector3, dir: Vector3, max_dist: float) -> Dictionary:
	var l := dir.length()
	if l < 1e-9 or not (max_dist >= 0.0): return {}
	var p := PhysicsRayQueryParameters3D.create(o, o + dir / l * max_dist, mask)
	p.hit_from_inside = false
	var r := space.intersect_ray(p)
	if r.is_empty(): return {}
	return {"distance": o.distance_to(r.position), "normal": r.normal, "point": r.position}

func sphere_cast(o: Vector3, r: float, dir: Vector3, max_dist: float) -> Dictionary:
	var l := dir.length()
	if l < 1e-9 or not (max_dist >= 0.0): return {}
	if r < 0.0005: return raycast(o, dir, max_dist)
	var d := dir / l
	_sphere.radius = r
	_q.collision_mask = mask
	_q.transform = Transform3D(Basis.IDENTITY, o)
	_q.motion = d * max_dist
	var res := space.cast_motion(_q)
	if res.size() < 2 or res[0] >= 1.0: return {}
	if res[1] <= 0.0: return {}
	var t: float = res[0] * max_dist
	_q.transform = Transform3D(Basis.IDENTITY, o + d * (res[1] * max_dist))
	_q.motion = Vector3.ZERO
	var info := space.get_rest_info(_q)
	var n: Vector3 = info.get("normal", -d) if not info.is_empty() else -d
	if n.length_squared() < 0.5: n = -d
	var pt: Vector3 = info.get("point", o + d * t - n * r) if not info.is_empty() else o + d * t - n * r
	return {"distance": t, "normal": n, "point": pt}

func current_hand_position(i: int) -> Vector3:
	var h := head_pos(); var p := hand_pos(i); var d := p - h
	if d.length() < MAX_ARM_LENGTH: return p
	return h + d.normalized() * MAX_ARM_LENGTH

func _collisions_sphere_cast(start: Vector3, r: float, move: Vector3, precision: float) -> Dictionary:
	var hit := sphere_cast(start, r * precision, move, move.length() + r * (1.0 - precision))
	if not hit.is_empty():
		var final_position: Vector3 = hit.point + hit.normal * r
		var fs := final_position - start
		var inner := sphere_cast(start, r * precision * precision, fs, fs.length() + r * (1.0 - precision * precision))
		if not inner.is_empty():
			final_position = start + fs.normalized() * maxf(0.0, hit.distance - r * (1.0 - precision * precision))
			hit = inner
		else:
			var inner2 := raycast(start, fs, fs.length() + r * precision * precision * 0.999)
			if not inner2.is_empty(): return {"hit": true, "end": start, "info": inner2}
		return {"hit": true, "end": final_position, "info": hit}
	var ray := raycast(start, move, move.length() + r * precision * 0.999)
	if not ray.is_empty(): return {"hit": true, "end": start, "info": ray}
	return {"hit": false, "end": Vector3.ZERO, "info": {}}

func _iterative(start: Vector3, r: float, move: Vector3, precision: float, single_hand: bool) -> Dictionary:
	var c := _collisions_sphere_cast(start, r * precision, move, precision)
	if c.hit:
		var first_position: Vector3 = c.end
		var slip := DEFAULT_SLIDE_FACTOR if not single_hand else 0.001
		var target := start + move
		var proj: Vector3 = (target - first_position).slide(c.info.normal) * slip
		var c2 := _collisions_sphere_cast(c.end, r, proj, precision * precision)
		if c2.hit: return {"hit": true, "end": c2.end}
		var from := proj + first_position
		var c3 := _collisions_sphere_cast(from, r, target - from, precision * precision * precision)
		if c3.hit: return {"hit": true, "end": c3.end}
		return {"hit": true, "end": first_position}
	var ml := move.length()
	var m2 := move * ((ml + r * precision * 0.34) / ml) if ml > 0.0 else Vector3.ZERO
	var c4 := _collisions_sphere_cast(start, r * precision * 0.66, m2, precision * 0.66)
	if c4.hit: return {"hit": true, "end": start}
	return {"hit": false, "end": Vector3.ZERO}

func _store_velocities(dt: float) -> void:
	velocity_index = (velocity_index + 1) % VELOCITY_HISTORY_SIZE
	var oldest := velocity_history[velocity_index]
	var cur := (rig.global_position - last_position) / dt
	denorm_avg += (cur - oldest) / VELOCITY_HISTORY_SIZE
	velocity_history[velocity_index] = cur
	last_position = rig.global_position

## Player.Update(): hands push the body around.
func update(dt: float) -> void:
	var lc := false; var rc := false
	var f: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
	var g := Vector3(0, -2.0 * 9.8 * dt * dt, 0)
	for i in 2:
		var dist := current_hand_position(i) - last_hand[i] + g
		var it := _iterative(last_hand[i], MIN_RAYCAST_DISTANCE, dist, DEFAULT_PRECISION, true)
		if it.hit:
			f[i] = (last_hand[i] - current_hand_position(i)) if was_touching[i] else (it.end - current_hand_position(i))
			velocity = Vector3.ZERO
			if i == 0: lc = true
			else: rc = true
	var both: bool = (lc or was_touching[0]) and (rc or was_touching[1])
	var rb_move: Vector3 = (f[0] + f[1]) / 2.0 if both else f[0] + f[1]

	var ih := _iterative(last_head_position, HEAD_RADIUS, head_pos() + rb_move - last_head_position, DEFAULT_PRECISION, false)
	if ih.hit:
		rb_move = ih.end - last_head_position
		var dir := head_pos() - last_head_position + rb_move
		if not raycast(last_head_position, dir, dir.length() + HEAD_RADIUS * DEFAULT_PRECISION * 0.999).is_empty():
			rb_move = last_head_position - head_pos()
	if rb_move.length_squared() > 0.0: rig.global_position += rb_move
	last_head_position = head_pos()

	both = (lc or was_touching[0]) and (rc or was_touching[1])
	for i in 2:
		var dist := current_hand_position(i) - last_hand[i]
		var it := _iterative(last_hand[i], MIN_RAYCAST_DISTANCE, dist, DEFAULT_PRECISION, not both)
		if it.hit:
			last_hand[i] = it.end
			if i == 0: lc = true
			else: rc = true
		else:
			last_hand[i] = current_hand_position(i)

	_store_velocities(dt)

	if (rc or lc) and not disable_movement:
		var m := denorm_avg.length()
		if m > VELOCITY_LIMIT:
			velocity = denorm_avg.normalized() * MAX_JUMP_SPEED if m * JUMP_MULTIPLIER > MAX_JUMP_SPEED else denorm_avg * JUMP_MULTIPLIER

	for i in 2:
		var col := lc if i == 0 else rc
		var cur := current_hand_position(i); var h := head_pos(); var to_hand := cur - h
		if col and cur.distance_to(last_hand[i]) > UNSTICK_DISTANCE and sphere_cast(h, MIN_RAYCAST_DISTANCE * DEFAULT_PRECISION, to_hand, to_hand.length() - MIN_RAYCAST_DISTANCE).is_empty():
			last_hand[i] = cur
			if i == 0: lc = false
			else: rc = false
	was_touching.assign([lc, rc])

## Player.Turn(): snap turn around the head.
func turn(rad: float) -> void:
	var h := head_pos()
	rig.global_position = (rig.global_position - h).rotated(Vector3.UP, rad) + h
	rig.rotate_y(rad)
	denorm_avg = denorm_avg.rotated(Vector3.UP, rad)
	for i in velocity_history.size(): velocity_history[i] = velocity_history[i].rotated(Vector3.UP, rad)

# Unity Rigidbody step with the rig's colliders: the head sphere and a body capsule under it.
func _body_spheres() -> Array:
	var h := head_pos()
	var yaw := head.global_transform.basis.get_euler().y
	var c := h + Vector3(0, -0.24, 0.06).rotated(Vector3.UP, yaw)
	return [h, c + Vector3(0, 0.1, 0), c, c + Vector3(0, -0.1, 0)]

func physics(dt: float) -> void:
	velocity.y -= GRAVITY * gravity_scale * dt
	var delta := velocity * dt
	grounded = false
	for iter in 3:
		if delta.length_squared() <= 1e-12: break
		var best := {}
		for s in _body_spheres():
			var hh := sphere_cast(s, BODY_RADIUS, delta, delta.length())
			if not hh.is_empty() and (best.is_empty() or hh.distance < best.distance): best = hh
		if best.is_empty():
			rig.global_position += delta; break
		var L := delta.length(); var mv := maxf(0.0, best.distance - 0.002)
		rig.global_position += delta * (mv / L)
		var n: Vector3 = best.normal
		delta *= 1.0 - mv / L
		delta -= n * delta.dot(n)
		var vn := velocity.dot(n)
		if vn < 0.0: velocity -= n * vn
		if n.y > 0.6: grounded = true
	# push out of anything we ended up inside
	_sphere.radius = BODY_RADIUS
	for s in _body_spheres():
		_q.transform = Transform3D(Basis.IDENTITY, s); _q.motion = Vector3.ZERO; _q.collision_mask = mask
		var info := space.get_rest_info(_q)
		if info.is_empty(): continue
		var p: Vector3 = info.point; var dv: Vector3 = s - p; var dl := dv.length()
		if dl < BODY_RADIUS and dl > 1e-6:
			var n := dv / dl
			rig.global_position += n * (BODY_RADIUS - dl)
			var vn := velocity.dot(n)
			if vn < 0.0: velocity -= n * vn
			if n.y > 0.6: grounded = true
	if grounded:
		var hs := Vector2(velocity.x, velocity.z).length(); var dec := FRICTION * GRAVITY * dt
		var k := (hs - dec) / hs if hs > dec else 0.0
		velocity.x *= k; velocity.z *= k
