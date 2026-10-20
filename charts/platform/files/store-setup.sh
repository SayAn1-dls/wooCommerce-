#!/bin/bash
# Sets up WordPress + WooCommerce. Safe to run any number of times:
# every step checks before it changes anything.
set -euo pipefail
cd /var/www/html

# plain mysqli instead of "wp db check": the mariadb cli insists on TLS
db_up() {
  php -r '$m = @mysqli_connect(getenv("WORDPRESS_DB_HOST"), getenv("WORDPRESS_DB_USER"),
    getenv("WORDPRESS_DB_PASSWORD"), getenv("WORDPRESS_DB_NAME")); exit($m ? 0 : 1);'
}
echo "waiting for the database"
for i in $(seq 1 60); do
  if db_up; then break; fi
  sleep 5
done
db_up

if ! wp core is-installed; then
  wp core install --url="$SHOP_URL" --title="Demo Shop" \
    --admin_user="$WP_ADMIN_USER" --admin_password="$WP_ADMIN_PASSWORD" \
    --admin_email="$WP_ADMIN_EMAIL" --skip-email
fi
# keeps home/siteurl right if the domain changes between installs
wp option update home "$SHOP_URL"
wp option update siteurl "$SHOP_URL"
wp option update timezone_string "$STORE_TIMEZONE"
if [ "$(wp option get permalink_structure)" != "/%postname%/" ]; then
  wp rewrite structure '/%postname%/'
fi

if ! wp plugin is-installed woocommerce; then
  if [ -n "${WOO_VERSION:-}" ]; then
    wp plugin install woocommerce --version="$WOO_VERSION"
  else
    wp plugin install woocommerce
  fi
fi
wp plugin is-active woocommerce || wp plugin activate woocommerce

wp option update woocommerce_currency "$STORE_CURRENCY"
wp option update woocommerce_default_country "IN:KA"
wp option update woocommerce_store_address "1 MG Road"
wp option update woocommerce_store_city "Bengaluru"
wp option update woocommerce_store_postcode "560001"
# new stores start in "coming soon" mode, which hides the shop from visitors
wp option update woocommerce_coming_soon no
wp option update woocommerce_cod_settings --format=json \
  '{"enabled":"yes","title":"Cash on delivery","description":"Pay with cash upon delivery.","instructions":"Pay with cash upon delivery.","enable_for_methods":[],"enable_for_virtual":"yes"}'

# zone 0 is "everywhere else"; free shipping there so checkout always has a method
if [ "$(wp wc shipping_zone_method list 0 --user=1 --format=count)" = "0" ]; then
  wp wc shipping_zone_method create 0 --method_id=free_shipping --enabled=true --user=1
fi

add_product() {
  if [ -z "$(wp post list --post_type=product --title="$1" --format=ids)" ]; then
    wp wc product create --name="$1" --regular_price="$2" --description="$3" \
      --status=publish --manage_stock=true --stock_quantity=25 --user=1 --porcelain
  fi
}
add_product "Cotton T-Shirt" 499 "Plain white cotton t-shirt."
add_product "Coffee Beans 250g" 350 "Medium roast, whole beans."
add_product "Canvas Tote Bag" 299 "Sturdy tote for groceries."

# Product pictures ship with the chart (files/images) because WordPress has no
# internet access. Only set when a product has none, so admin changes stick.
add_image() {
  local id
  id=$(wp post list --post_type=product --title="$1" --format=ids)
  [ -z "$id" ] && return 0
  if [ -z "$(wp post meta get "$id" _thumbnail_id 2>/dev/null || true)" ]; then
    wp media import "/images/$2" --post_id="$id" --featured_image --title="$1" --porcelain
  fi
}
add_image "Cotton T-Shirt" tshirt.jpg
add_image "Coffee Beans 250g" beans.jpg
add_image "Canvas Tote Bag" tote.jpg

# a friendlier picture for products that have none, e.g. ones made through the chat
placeholder=$(wp post list --post_type=attachment --post_status=inherit --title="mcpg-placeholder" --format=ids)
if [ -z "$placeholder" ]; then
  placeholder=$(wp media import /images/product.jpg --title="mcpg-placeholder" --porcelain)
fi
wp option update woocommerce_placeholder_image "$placeholder"

# REST key for woo-mcp. Reuse the one in the woo-api Secret if WooCommerce
# still knows it, otherwise make a new one and write it back.
API=https://kubernetes.default.svc/api/v1/namespaces/$NAMESPACE/secrets/woo-api
SA=/var/run/secrets/kubernetes.io/serviceaccount
TOKEN=$(cat $SA/token)
current=$(curl -sf --cacert $SA/ca.crt -H "Authorization: Bearer $TOKEN" "$API" \
  | php -r '$s = json_decode(stream_get_contents(STDIN), true); echo base64_decode($s["data"]["consumer_key"] ?? "");')

known=0
if [ -n "$current" ]; then
  known=$(CK="$current" wp eval 'global $wpdb; echo (int) $wpdb->get_var($wpdb->prepare(
    "SELECT COUNT(*) FROM {$wpdb->prefix}woocommerce_api_keys WHERE consumer_key = %s", wc_api_hash(getenv("CK"))));')
fi

if [ "$known" = "0" ]; then
  echo "creating a new WooCommerce REST key"
  pair=$(wp eval '
    $ck = "ck_" . wc_rand_hash();
    $cs = "cs_" . wc_rand_hash();
    global $wpdb;
    $wpdb->insert($wpdb->prefix . "woocommerce_api_keys", array(
      "user_id" => 1, "description" => "woo-mcp", "permissions" => "read_write",
      "consumer_key" => wc_api_hash($ck), "consumer_secret" => $cs,
      "truncated_key" => substr($ck, -7),
    ));
    echo base64_encode($ck) . " " . base64_encode($cs);')
  read -r ck cs <<< "$pair"
  curl -sf --cacert $SA/ca.crt -H "Authorization: Bearer $TOKEN" \
    -X PATCH -H "Content-Type: application/merge-patch+json" \
    -d "{\"data\":{\"consumer_key\":\"$ck\",\"consumer_secret\":\"$cs\"}}" "$API" >/dev/null
  echo "woo-api secret updated"
else
  echo "woo-api secret already valid"
fi
echo "store setup done"
