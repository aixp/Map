/*
	Alexander Shiryaev, 2021.11
*/

#if GOBJECT
[CCode (cheader_filename = "cairo-gobject.h", gir_namespace = "cairo", gir_version = "1.0")]
#else
[CCode (cheader_filename = "cairo.h", gir_namespace = "cairo", gir_version = "1.0")]
#endif
namespace cairo_jpg {
#if GOBJECT
	[CCode (cname = "cairo_surface_t", ref_function = "cairo_surface_reference", unref_function = "cairo_surface_destroy", type_id = "cairo_gobject_surface_get_type ()")]
#else
	[CCode (cname = "cairo_surface_t", ref_function = "cairo_surface_reference", unref_function = "cairo_surface_destroy")]
#endif
	[Compact]
	public class ImageSurface : Cairo.Surface {
		[CCode (cname = "cairo_image_surface_create")]
		public ImageSurface (Cairo.Format format, int width, int height);
		[CCode (cname = "cairo_image_surface_create_for_data")]
		public ImageSurface.for_data ([CCode (array_length = false)] uchar[] data, Cairo.Format format, int width, int height, int stride);
		[CCode (cname = "cairo_image_surface_create_from_png")]
		public ImageSurface.from_png (string filename);
		[CCode (cheader_filename = "cairo_jpg.h", cname = "cairo_image_surface_create_from_jpeg")]
		public ImageSurface.from_jpeg (string filename);
		[CCode (cname = "cairo_image_surface_create_from_png_stream")]
		public ImageSurface.from_png_stream (Cairo.ReadFunc read_func);
		[CCode (cheader_filename = "cairo_jpg.h", cname = "cairo_image_surface_create_from_jpeg_stream")]
		public ImageSurface.from_jpeg_stream (Cairo.ReadFunc read_func);
		[CCode (cheader_filename = "cairo_jpg.h", cname = "cairo_image_surface_create_from_jpeg_mem")]
		public ImageSurface.from_jpeg_mem (void *data, size_t len);
		[CCode (array_length = false)]
		public unowned uchar[] get_data ();
		public Cairo.Format get_format ();
		public int get_height ();
		public int get_stride ();
		public int get_width ();
	}
}