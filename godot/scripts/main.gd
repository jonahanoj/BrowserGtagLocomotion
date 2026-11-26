## Scrapper (Godot): starts VR if there's a headset, builds the world, runs the player.
extends Node3D

var player: Player
var xr: XRInterface
var lobby: Lobby

func _ready() -> void:
	xr = XRServer.find_interface("OpenXR")
	var vr := xr != null and xr.is_initialized()
	if vr:
		get_viewport().use_xr = true
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	var env := WorldEnvironment.new(); var e := Environment.new()
	e.background_mode = Environment.BG_COLOR; e.background_color = Color("10141a")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; e.ambient_light_color = Color("c8d4e0"); e.ambient_light_energy = 0.6
	env.environment = e; add_child(env)
	lobby = Lobby.new(); add_child(lobby)
	player = Player.new(); player.xr_active = vr; add_child(player)
	await get_tree().physics_frame
	await get_tree().physics_frame
	player.start(get_world_3d().direct_space_state, Lobby.SPAWN, Lobby.SPAWN_YAW)
	if "--loco-test" in OS.get_cmdline_user_args():
		LocoTest.new().run(self)

func _process(delta: float) -> void:
	if player and player.loco and player.loco.space:
		player.step(minf(delta, 1.0 / 30.0))
