#!/usr/bin/env bash
# Lists the latest WooCommerce orders straight from WordPress (what WP admin shows).
set -euo pipefail
kubectl -n mcpg exec deploy/wordpress -- php -r '
  $_SERVER["HTTP_HOST"] = "localhost";
  require "/var/www/html/wp-load.php";
  foreach (wc_get_orders(array("limit" => 10)) as $o) {
    printf("%d %s %s %s %s\n", $o->get_id(), $o->get_status(), $o->get_payment_method(),
      $o->get_total(), $o->get_date_created()->date("c"));
  }' 2>/dev/null
