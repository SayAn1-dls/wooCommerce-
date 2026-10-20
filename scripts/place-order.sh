#!/usr/bin/env bash
# Places a Cash on delivery order through the storefront, using the same
# Store API calls the WooCommerce checkout page makes in a browser.
# Usage: scripts/place-order.sh [shop-url]   prints the new order id
set -euo pipefail
SHOP=${1:-http://shop.localhost}
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT

product=$(curl -sf "$SHOP/wp-json/wc/store/v1/products?per_page=1" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
nonce=$(curl -sf -c "$jar" -b "$jar" -D - -o /dev/null "$SHOP/wp-json/wc/store/v1/cart" | awk 'tolower($1)=="nonce:" {print $2}' | tr -d '\r')

curl -sf -c "$jar" -b "$jar" -H "Nonce: $nonce" -H 'Content-Type: application/json' \
  -d "{\"id\": $product, \"quantity\": 1}" "$SHOP/wp-json/wc/store/v1/cart/add-item" >/dev/null

address='"first_name":"Test","last_name":"Buyer","address_1":"1 MG Road","city":"Bengaluru","state":"KA","postcode":"560001","country":"IN"'
curl -sf -c "$jar" -b "$jar" -H "Nonce: $nonce" -H 'Content-Type: application/json' \
  -d "{\"billing_address\":{$address,\"email\":\"buyer@example.com\",\"phone\":\"9999999999\"},\"shipping_address\":{$address},\"payment_method\":\"cod\"}" \
  "$SHOP/wp-json/wc/store/v1/checkout" \
  | python3 -c 'import json,sys; o=json.load(sys.stdin); print(o["order_id"], o["status"])'
