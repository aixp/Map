uses GLib
uses Gtk

uses Map

const PACKAGE: string = "Map"

const VERSION: string = "2022.02.18"

def private initIntl ()
	GLib.Intl.setlocale(GLib.LocaleCategory.ALL, "")
	if GLib.FileUtils.test("mo", GLib.FileTest.IS_DIR)
		GLib.Intl.bindtextdomain(PACKAGE, "mo")
	else
		var s = GLib.Path.build_filename(GLib.Environment.get_user_data_dir(), PACKAGE, "locale")
		if GLib.FileUtils.test(s, GLib.FileTest.IS_DIR)
			GLib.Intl.bindtextdomain(PACKAGE, s)
	GLib.Intl.bind_textdomain_codeset(PACKAGE, "UTF-8")
	GLib.Intl.textdomain(PACKAGE)

def private initCSS ()
	var cssProvider = new Gtk.CssProvider()
	cssProvider.load_from_resource("/Map.css")
	Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

init
	initIntl()

	Gtk.init(ref args)

	initCSS()

	Map.init()
	Map.map.set_title(Map.map.title + " " + VERSION)
	Map.map.destroy.connect(Gtk.main_quit)

	Gtk.main()

	Map.close()

	print("all done")
