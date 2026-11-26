## Headless checks for the locomotion:  godot --headless -- --loco-test
class_name LocoTest
extends RefCounted

func run(main: Node) -> void:
	var p: Player = main.player
	var dt := 1.0 / 72.0
	var out := PackedStringArray()
	var steps := func(n: int): for k in n: p.step(dt)
	# 1. stand: you settle onto the floor and stay there
	steps.call(150)
	var y0 := p.cam.global_position.y
	steps.call(150)
	out.append("stand: head y %.3f -> %.3f (floor 0)" % [y0, p.cam.global_position.y])
	# 2. walk: hands down on the floor, drag them back -> you move forward (towards -x at this yaw)
	var start := p.global_position
	for stroke in 4:
		p.hand_local = [Vector3(-0.25, 0.9, -0.55), Vector3(0.25, 0.9, -0.55)]
		steps.call(12)
		for k in 30:
			p.hand_local[0].z += 0.025; p.hand_local[1].z += 0.025
			p.step(dt)
		p.hand_local = [Vector3(-0.25, 1.3, -0.3), Vector3(0.25, 1.3, -0.3)]
		steps.call(10)
	steps.call(40)
	var moved := p.global_position - start
	out.append("walk: moved %s (expect x < 0: facing -x)" % [moved.snapped(Vector3.ONE * 0.01)])
	# 3. jump: push down hard and fast -> airborne
	p.hand_local = [Vector3(-0.25, 0.8, -0.3), Vector3(0.25, 0.8, -0.3)]
	steps.call(20)
	var maxy := p.cam.global_position.y; var base := maxy
	for k in 8:
		p.hand_local[0].y -= 0.09; p.hand_local[1].y -= 0.09
		p.step(dt)
	p.hand_local = [Vector3(-0.3, 1.4, -0.2), Vector3(0.3, 1.4, -0.2)]
	for k in 60:
		p.step(dt); maxy = maxf(maxy, p.cam.global_position.y)
	out.append("jump: head rose %.2f m (vel was %.2f)" % [maxy - base, p.loco.velocity.length()])
	steps.call(120)
	# 4. walls: drag yourself toward the west wall for a long time -> stop at it
	for stroke in 30:
		p.hand_local = [Vector3(-0.25, 0.9, -0.55), Vector3(0.25, 0.9, -0.55)]
		steps.call(6)
		for k in 20:
			p.hand_local[0].z += 0.035; p.hand_local[1].z += 0.035
			p.step(dt)
		p.hand_local = [Vector3(-0.25, 1.3, -0.3), Vector3(0.25, 1.3, -0.3)]
		steps.call(6)
	out.append("wall: head x %.2f (west wall face at %.2f)" % [p.cam.global_position.x, Lobby.X0 + Lobby.TW / 2])
	# 5. turn
	var yaw0 := p.rotation.y
	p.loco.turn(PI / 4)
	out.append("turn: yaw %.2f -> %.2f" % [yaw0, p.rotation.y])
	print("LOCO TEST\n" + "\n".join(out))
	main.get_tree().quit()
