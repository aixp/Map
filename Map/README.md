# About

This is mapping software primarily developed as part of Unmanned Aerial Systems software

# Build

## Install build requirements

### Manjaro

    pacman -S python vala make gettext libgee libsoup3 appimagetool-bin

### OpenBSD

    pkg_add python vala gettext gtk+3 libsoup3 json-glib

## Build

    cd Map && ./mkmkfile.sh && make

## Build AppImage (optional, Linux only)

    cd Map && ./mkAppImage.sh

# Run

    cd Map && ./Map

# Third party resources and code included

[Globe_icon.svg](https://upload.wikimedia.org/wikipedia/commons/c/c4/Globe_icon.svg)

[cairo_jpg](https://github.com/rahra/cairo_jpg)

# Useful links

[Calculate distance, bearing and more between Latitude/Longitude points](https://www.movable-type.co.uk/scripts/latlong.html)

[Trigonometric rule on a spherical square](https://math.stackexchange.com/questions/859978/trigonometric-rule-on-a-spherical-square)
