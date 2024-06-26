#!/bin/bash

set -e

# See https://stackoverflow.com/a/72987195/7900695
sed '/<head>/a<script src="${CONFIG_URL}"></script>' build/index.html > temp.html && mv temp.html build/index.html

serve -s build -l 5000
