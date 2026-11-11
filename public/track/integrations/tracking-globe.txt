<?php
/**
 * Plugin Name: Tracking Globe
 * Description: Shortcode for the Tracking Globe shipment map: [tracking_globe config="..." height="560"]. Lets roles without unfiltered_html place the map.
 * Version: 1.0.0
 * License: MIT
 */

if (!defined('ABSPATH')) exit;

add_shortcode('tracking_globe', function ($atts) {
    $a = shortcode_atts(['config' => '', 'height' => '560', 'base' => 'https://www.ifcvieweronline.eu/track/v1/'], $atts, 'tracking_globe');
    // The config is URL-safe base64; anything else is not ours.
    $config = preg_replace('/[^A-Za-z0-9_-]/', '', $a['config']);
    $height = max(240, min(1200, (int) $a['height']));
    wp_enqueue_script('tracking-globe', trailingslashit(esc_url_raw($a['base'])) . 'tracker.js', [], '1', ['strategy' => 'async', 'in_footer' => true]);
    return sprintf('<tracking-globe config="%s" style="display:block;height:%dpx"></tracking-globe>', esc_attr($config), $height);
});
