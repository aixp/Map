# About

This is mapping software primarily developed as part of Unmanned Aerial Systems software

# Build

## Install build requirements

### Ubuntu 22.04 LTS

    apt install valac libgtk-3-dev libgee-0.8-dev libsqlite3-dev libsoup-3.0-dev

### Manjaro

    pacman -S python vala make gettext libgee libsoup3

### OpenBSD

    pkg_add python vala gettext gtk+3 libsoup3 json-glib

## Install AppImage build requirements (optional)

### Ubuntu 22.04 LTS

    apt install patchelf

[AppImageTool](https://appimage.github.io/appimagetool/)

### Manjaro

    pacman -S patchelf appimagetool-bin

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
