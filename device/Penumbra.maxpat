{
	"patcher" : {
		"fileversion" : 1,
		"appversion" : {
			"major" : 8,
			"minor" : 6,
			"revision" : 0,
			"architecture" : "x64",
			"modernui" : 1
		},
		"classnamespace" : "dsp.gen",
		"rect" : [ 59, 115, 500, 310 ],
		"bglocked" : 0,
		"openinpresentation" : 0,
		"default_fontsize" : 12.0,
		"default_fontface" : 0,
		"default_fontname" : "Arial",
		"gridonopen" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"gridsnaponopen" : 1,
		"fixedsize" : 0,
		"boxes" : [
			{
				"box" : {
					"id" : "obj-1",
					"maxclass" : "comment",
					"text" : "Penumbra",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 15.0, 15.0, 200.0, 24.0 ],
					"fontsize" : 18.0,
					"fontface" : 1,
					"fontname" : "Arial"
				}
			},
			{
				"box" : {
					"id" : "obj-2",
					"maxclass" : "comment",
					"text" : "Ableton Live \u2192 DMX \u00b7 E1.31 \u00b7 WLED",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 15.0, 42.0, 380.0, 18.0 ],
					"fontsize" : 11.0,
					"fontname" : "Arial"
				}
			},
			{
				"box" : {
					"id" : "obj-3",
					"maxclass" : "comment",
					"text" : "Host",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 15.0, 80.0, 38.0, 18.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-4",
					"maxclass" : "message",
					"text" : "127.0.0.1",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 55.0, 77.0, 150.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-5",
					"maxclass" : "comment",
					"text" : "Port",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 215.0, 80.0, 38.0, 18.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-6",
					"maxclass" : "message",
					"text" : "7000",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 252.0, 77.0, 55.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-7",
					"maxclass" : "newobj",
					"text" : "loadbang",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "bang" ],
					"patching_rect" : [ 15.0, 115.0, 70.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-8",
					"maxclass" : "newobj",
					"text" : "t b b",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "bang", "bang" ],
					"patching_rect" : [ 15.0, 145.0, 42.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-9",
					"maxclass" : "newobj",
					"text" : "pak s 7000",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 55.0, 175.0, 110.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-10",
					"maxclass" : "newobj",
					"text" : "prepend connect",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 55.0, 205.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-11",
					"maxclass" : "comment",
					"text" : "Double-click a message box to edit, click it to apply.",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 15.0, 240.0, 380.0, 18.0 ],
					"fontsize" : 10.0,
					"textcolor" : [ 0.5, 0.5, 0.5, 1.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-12",
					"maxclass" : "newobj",
					"text" : "js scripts/dist/main.js",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 15.0, 265.0, 185.0, 22.0 ]
				}
			},
			{
				"box" : {
					"id" : "obj-13",
					"maxclass" : "newobj",
					"text" : "udpsend 127.0.0.1 7000",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 15.0, 293.0, 180.0, 22.0 ]
				}
			}
		],
		"lines" : [
			{
				"patchline" : {
					"source" : [ "obj-7", 0 ],
					"destination" : [ "obj-8", 0 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-8", 1 ],
					"destination" : [ "obj-6", 0 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-8", 0 ],
					"destination" : [ "obj-4", 0 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-4", 0 ],
					"destination" : [ "obj-9", 0 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-6", 0 ],
					"destination" : [ "obj-9", 1 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-9", 0 ],
					"destination" : [ "obj-10", 0 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-10", 0 ],
					"destination" : [ "obj-13", 0 ],
					"midpoints" : []
				}
			},
			{
				"patchline" : {
					"source" : [ "obj-12", 0 ],
					"destination" : [ "obj-13", 0 ],
					"midpoints" : []
				}
			}
		],
		"dependency_cache" : [],
		"saved_attribute_attributes" : {}
	}
}
