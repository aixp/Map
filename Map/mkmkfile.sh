#!/bin/sh

# echo "VALACFLAGS += -X -O2" > Makefile
../mkmkfile.py Map Main Unix "es uk ru hi sw lt lv et fi" > Makefile

../mkmkfile.py Map Main Windows "es uk ru hi sw lt lv et fi" > Makefile.mingw
