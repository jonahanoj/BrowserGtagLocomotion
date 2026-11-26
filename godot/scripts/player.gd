## The player: an XR rig (head + two hands) that moves with Gorilla Tag locomotion.
## Without a headset (desktop/testing) the head and hands are placed by code: head_local / hand_local.
class_name Player
extends XROrigin3D

var cam: XRCamera3D
var ctrl: Array = []
var claws: Array = []
var loco: GorillaLoco
var turn_latch := false
var xr_active := false
var head_local := Vector3(0, 1.5, 0)
var hand_local := [Vector3(-0.3, 1.1, -0.3), Vector3(0.3, 1.1, -0.3)]

func _ready() -> void:
	cam = XRCamera3D.new(); cam.near = 0.03; cam.far = 120.0; add_child(cam)
	for i in 2:
		var c := XRController3D.new(); c.tracker = &"left_hand" if i == 0 else &"right_hand"; c.pose = &"grip"
		add_child(c); ctrl.append(c)
		var claw := _make_claw(); get_parent().add_child.call_deferred(claw); claws.append(claw)
	if not xr_active:
		_apply_sim()
	loco = GorillaLoco.new(self, cam, ctrl[0], ctrl[1])

func _make_claw() -> Node3D:
	var g := Node3D.new()
	var m := Geo.mat(Color("8d939a"), 0.4, 0.6)
	var palm := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(0.08, 0.06, 0.1); palm.mesh = bm; palm.material_override = m; g.add_child(palm)
	for k in 3:
		var f := MeshInstance3D.new(); var fm := BoxMesh.new(); fm.size = Vector3(0.016, 0.016, 0.07); f.mesh = fm
		f.material_override = Geo.mat(Color("ff6a50"), 0.5) if k == 1 else m
		f.position = Vector3(-0.025 + k * 0.025, -0.01, -0.07); g.add_child(f)
	return g

func _apply_sim() -> void:
	cam.position = head_local
	for i in 2: ctrl[i].position = hand_local[i]

func start(space: PhysicsDirectSpaceState3D, at: Vector3, yaw: float) -> void:
	loco.space = space
	teleport(at, yaw)

func teleport(at: Vector3, yaw: float) -> void:
	rotation = Vector3(0, yaw, 0)
	global_position = at
	if not xr_active: _apply_sim()
	loco.initialize_values()

func step(dt: float) -> void:
	if not xr_active: _apply_sim()
	loco.physics(dt)
	loco.update(dt)
	# snap turn on the right stick, 45 degrees
	if xr_active:
		var sx: float = ctrl[1].get_vector2(&"primary").x
		if absf(sx) > 0.7 and not turn_latch:
			loco.turn(-PI / 4 if sx > 0.0 else PI / 4); turn_latch = true
		elif absf(sx) < 0.3: turn_latch = false
	# claws sit where the hands are (stopped by walls), facing the way the controllers face
	for i in 2:
		claws[i].global_position = loco.last_hand[i]
		claws[i].global_basis = ctrl[i].global_basis
