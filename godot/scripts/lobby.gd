## The lobby: the robot workshop room players start in (same layout as the web version).
class_name Lobby
extends Node3D

const X0 := -20.0
const X1 := -12.0
const Z0 := 0.0
const Z1 := 7.0
const H := 2.7
const TW := 0.24
const SPAWN := Vector3(-17.9, 0, 3.6)
const SPAWN_YAW := PI / 2

func _ready() -> void:
	var wall := Geo.mat(Color("2f5a72"), 0.6, 0.3)
	var floor_m := Geo.mat(Color("4c535c"), 0.7, 0.4)
	var ceil_m := Geo.mat(Color("272d35"), 0.9)
	var hazard := Geo.mat(Color("f2c230"), 0.6)
	var desk := Geo.mat(Color("3a4048"), 0.6, 0.3)
	var wood := Geo.mat(Color("9a6a3a"), 0.8)
	Geo.box(self, Vector3(X0 - 1, -1, Z0 - 1), Vector3(X1 + 1, 0, Z1 + 1), floor_m)
	Geo.box(self, Vector3(X0 - 1, H, Z0 - 1), Vector3(X1 + 1, H + 1, Z1 + 1), ceil_m)
	Geo.box(self, Vector3(X0 - TW / 2, 0, Z0 - TW / 2), Vector3(X0 + TW / 2, H, Z1 + TW / 2), wall)
	Geo.box(self, Vector3(X1 - TW / 2, 0, Z0 - TW / 2), Vector3(X1 + TW / 2, H, Z1 + TW / 2), wall)
	Geo.box(self, Vector3(X0, 0, Z0 - TW / 2), Vector3(X1, H, Z0 + TW / 2), wall)
	Geo.box(self, Vector3(X0, 0, Z1 - TW / 2), Vector3(X1, H, Z1 + TW / 2), wall)
	# hazard kick plates
	for z in [Z0 + TW / 2 + 0.005, Z1 - TW / 2 - 0.005]:
		Geo.box(self, Vector3(X0 + TW / 2, 0, z - 0.004), Vector3(X1 - TW / 2, 0.22, z + 0.004), hazard, false)
	# the PLAY pedestal (front-right of spawn) and the computer desk with its step stool
	Geo.box(self, Vector3(-19.15, 0, 2.05), Vector3(-18.65, 0.55, 2.55), desk)
	Geo.box(self, Vector3(-19.1, 0.55, 2.1), Vector3(-18.7, 0.62, 2.5), Geo.mat(Color("ff3b2f"), 0.5))
	Geo.box(self, Vector3(-12.95, 0, 0.45), Vector3(-12.12, 0.65, 1.97), desk)
	Geo.box(self, Vector3(-13.62, 0, 0.53), Vector3(-12.97, 0.3, 1.89), wood)
	# lights
	for x in [-18.0, -14.0]:
		var l := OmniLight3D.new(); l.position = Vector3(x, H - 0.3, 3.5); l.omni_range = 7.0; l.light_energy = 1.4
		add_child(l)
		Geo.box(self, Vector3(x - 0.4, H - 0.02, 3.2), Vector3(x + 0.4, H, 3.8), Geo.mat(Color("fff6e0")), false)
