<?php
/**
 * Plugin Name:       Bimo IFC Viewer
 * Plugin URI:        https://github.com/j03rul4nd/ifc-viewer-online/tree/main/integrations/wordpress
 * Description:       Embed interactive 3D IFC (BIM) models in posts and pages: Health Score, federated models, point clouds, the model on the map, sun studies, plan cuts and digital twin scenes. Block and [ifc_viewer] shortcode.
 * Version:           1.2.0
 * Requires at least: 6.1
 * Requires PHP:      7.4
 * Author:            IFC Viewer Online
 * Author URI:        https://www.ifcvieweronline.eu/
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       bimo-ifc-viewer
 *
 * The viewer runs in the visitor's browser inside an iframe served by
 * www.ifcvieweronline.eu. The IFC file is fetched by that browser straight
 * from this site: nothing is uploaded to IFC Viewer Online.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'IFCVO_VERSION', '1.2.0' );
define( 'IFCVO_APP_URL', 'https://www.ifcvieweronline.eu/' );
define( 'IFCVO_APP_ORIGIN', 'https://www.ifcvieweronline.eu' );

/**
 * Embed parameters the plugin passes through, with the values each accepts.
 * Anything else is dropped: the iframe URL is built only from these.
 * Reference: docs/EMBED_URL_PARAMS.md in the IFC Viewer Online repository.
 */
function ifcvo_param_rules() {
	return array(
		'ui'        => array( 'minimal', 'full', 'kiosk', 'client', 'article' ),
		'view'      => array( 'iso', 'top', 'front', 'back', 'left', 'right', 'bottom' ),
		'wheel'     => array( 'always', 'ctrl' ),
		'validate'  => array( '1', '0' ),
		'turntable' => '/^(1|0|\d{1,3})$/',
		'lang'      => array( 'en', 'es', 'ca', 'de', 'fr', 'it', 'pt', 'ja', 'zh', 'th' ),
		'accent'    => '/^#?[0-9a-fA-F]{6}$/',
		'bg'        => '/^(white|paper|blueprint|sky|studio|[0-9a-fA-F]{6}(,[0-9a-fA-F]{6})?)$/',
		'map'       => '/^(1|0|[a-z]+(,[a-z]+){0,7})$/',
		'look'      => '/^[a-z]+(\.\.[a-z]+)?$/',
		'solar'     => '/^(\d{4}-)?\d{2}-\d{2}T\d{2}:\d{2}$/',
		'moon'      => array( '1', '0' ),
		'analysis'  => '/^[a-zA-Z0-9:,=.\-]{1,60}$/',
		'site'      => '/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/',
		'drawings'  => array( 'plan' ),
		'explore'   => array( '1', '0' ),
		'toolbar'   => array( '1', '0' ),
		// "none" is the shortcode's way to say `tools=` (no tools at all).
		'tools'     => '/^(none|(validate|measure)(,(validate|measure))?)$/',
		'panels'    => '/^(none|(properties|scene|measurement|section|plans|map|solar|flood|devices|pointcloud|mesh)(,(properties|scene|measurement|section|plans|map|solar|flood|devices|pointcloud|mesh)){0,10})$/',
		'autoframe' => array( '1', '0' ),
		'fill'      => '/^(0?\.\d{1,3}|[2-9]\d)$/',
		'rule'      => '/^RULE_[A-Z0-9_]{2,60}$/',
		'flood'     => '/^(shower|storm|intense|extreme)(,(1m|2m|5m|free|closed|sealed|compacted|loam|sandy)){0,3}$/',
	);
}

/** Shortcode / block attributes and their defaults. */
function ifcvo_default_atts() {
	return array(
		'model'      => '',
		'attachment' => 0,
		'name'       => '',
		'height'     => 600,
		'ui'         => '',
		'view'       => 'iso',
		'wheel'      => 'ctrl',
		'validate'   => '1',
		'turntable'  => '',
		'lang'       => '',
		'accent'     => '',
		'bg'         => '',
		'title'      => '',
		'scan'       => '',
		'scene'      => '',
		'map'        => '',
		'look'       => '',
		'solar'      => '',
		'moon'       => '',
		'analysis'   => '',
		'site'       => '',
		'drawings'   => '',
		'explore'    => '',
		// 1.2.0
		'toolbar'    => '',
		'tools'      => '',
		'panels'     => '',
		'autoframe'  => '',
		'fill'       => '',
		'layers'     => '',
		'rule'       => '',
		'flood'      => '',
		'fullscreen' => '',
		'load'       => '',
		'poster'     => '',
		'poster_title' => '',
		'poster_text'  => '',
		'launch_label' => '',
		'form_field'   => '',
	);
}

/** Site-wide settings (Settings → Bimo IFC Viewer), with their defaults. */
function ifcvo_settings() {
	$saved = get_option( 'ifcvo_settings', array() );
	return wp_parse_args(
		is_array( $saved ) ? $saved : array(),
		array(
			'accent'     => '',
			'lang'       => '',
			'ui'         => '',
			'bg'         => '',
			'load'       => 'auto',
			'poster'     => '',
			'consent'    => '',
			'form_field' => '0',
			'datalayer'  => '0',
		)
	);
}

/** Empty attributes take the site-wide default; 1.1.0 embeds stay as they were. */
function ifcvo_apply_settings( $atts ) {
	$settings = ifcvo_settings();
	foreach ( array( 'accent', 'lang', 'bg' ) as $key ) {
		if ( '' === trim( (string) $atts[ $key ] ) && '' !== $settings[ $key ] ) {
			$atts[ $key ] = $settings[ $key ];
		}
	}
	if ( '' === trim( (string) $atts['ui'] ) ) {
		$atts['ui'] = '' !== $settings['ui'] ? $settings['ui'] : 'article';
	}
	if ( ! in_array( $atts['load'], array( 'auto', 'click' ), true ) ) {
		$atts['load'] = 'click' === $settings['load'] ? 'click' : 'auto';
	}
	if ( '' === trim( (string) $atts['poster'] ) ) {
		$atts['poster'] = $settings['poster'];
	}
	return $atts;
}

/** "a, b,,c" → array( 'a', 'b', 'c' ). Block and shortcode both give lists as comma-separated text. */
function ifcvo_list( $value ) {
	return array_values( array_filter( array_map( 'trim', explode( ',', (string) $value ) ), 'strlen' ) );
}

/** The CORS-enabled route for an IFC attachment of this site, or '' when it is not one. */
function ifcvo_attachment_route( $attachment_id ) {
	return $attachment_id && ifcvo_is_ifc_attachment( $attachment_id ) ? rest_url( 'bimo-ifc-viewer/v1/file/' . $attachment_id ) : '';
}

/**
 * The model URLs the viewer can fetch, each with its display name: attachments of
 * this site (served through the CORS-enabled REST route below) and https URLs.
 * Several models load together as one federated scene.
 */
function ifcvo_resolve_models( $atts ) {
	$models = array();
	foreach ( ifcvo_list( $atts['attachment'] ) as $id ) {
		$route = ifcvo_attachment_route( absint( $id ) );
		if ( $route ) {
			// The route URL ends in "file/<id>", so give the viewer the real file name.
			$models[] = array( $route, wp_basename( (string) get_attached_file( absint( $id ) ) ) );
		}
	}
	foreach ( ifcvo_list( $atts['model'] ) as $url ) {
		// A URL of this site's own uploads goes through the REST route too, so the
		// viewer (another origin) is allowed to read it.
		$id    = attachment_url_to_postid( $url );
		$route = ifcvo_attachment_route( $id );
		if ( $route ) {
			$models[] = array( $route, wp_basename( (string) get_attached_file( $id ) ) );
			continue;
		}
		$url = esc_url_raw( $url, array( 'https' ) );
		if ( $url ) {
			$models[] = array( $url, '' );
		}
	}
	$names = ifcvo_list( sanitize_text_field( (string) $atts['name'] ) );
	foreach ( $models as $i => $model ) {
		if ( isset( $names[ $i ] ) ) {
			$models[ $i ][1] = $names[ $i ];
		}
	}
	return array_slice( $models, 0, 12 );
}

/** https URLs only, for the point clouds and the scene document. */
function ifcvo_https_list( $value, $max ) {
	$urls = array();
	foreach ( ifcvo_list( $value ) as $url ) {
		$url = esc_url_raw( $url, array( 'https' ) );
		if ( $url ) {
			$urls[] = $url;
		}
	}
	return array_slice( $urls, 0, $max );
}

/** Build the viewer URL from validated attributes only. */
function ifcvo_build_embed_url( $atts ) {
	$models = ifcvo_resolve_models( $atts );
	$scene  = ifcvo_https_list( $atts['scene'], 1 );
	// A scene document brings its own models.
	if ( ! $models && ! $scene ) {
		return '';
	}
	$query = array( 'embed' => '1' );
	if ( $models ) {
		$query['model'] = implode( ',', wp_list_pluck( $models, 0 ) );
		$names          = wp_list_pluck( $models, 1 );
		if ( array_filter( $names, 'strlen' ) ) {
			// Names are parallel to the models, so a model without one keeps an empty slot.
			$query['name'] = implode( ',', str_replace( ',', ' ', $names ) );
		}
	}
	if ( $scene ) {
		$query['scene'] = $scene[0];
	}
	$scan = ifcvo_https_list( $atts['scan'], 4 );
	if ( $scan ) {
		$query['scan'] = implode( ',', $scan );
	}
	$layers = ifcvo_https_list( $atts['layers'], 1 );
	if ( $layers ) {
		$query['layers'] = $layers[0];
	}
	foreach ( ifcvo_param_rules() as $key => $rule ) {
		$value = trim( (string) $atts[ $key ] );
		if ( '' === $value ) {
			continue;
		}
		$ok = is_array( $rule ) ? in_array( $value, $rule, true ) : (bool) preg_match( $rule, $value );
		if ( ! $ok ) {
			continue;
		}
		if ( 'accent' === $key ) {
			$value = ltrim( $value, '#' );
		}
		if ( ( 'tools' === $key || 'panels' === $key ) && 'none' === $value ) {
			$value = '';
		}
		// The viewer's defaults need no parameter.
		// Explicit parameters win over the scene's, so the block's default view would
		// replace the camera the scene was saved with.
		if ( $scene && 'view' === $key && 'iso' === $value ) {
			continue;
		}
		if ( ( 'validate' === $key && '1' === $value ) || ( 'ui' === $key && 'minimal' === $value ) || ( 'map' === $key && '0' === $value ) ) {
			continue;
		}
		$query[ $key ] = $value;
	}
	return add_query_arg( array_map( 'rawurlencode', $query ), IFCVO_APP_URL );
}

/** The poster image URL: a Media Library ID or an https URL. */
function ifcvo_poster_url( $poster ) {
	$poster = trim( (string) $poster );
	if ( '' === $poster ) {
		return '';
	}
	if ( ctype_digit( $poster ) ) {
		$url = wp_get_attachment_image_url( absint( $poster ), 'large' );
		return $url ? $url : '';
	}
	return esc_url_raw( $poster, array( 'https' ) );
}

/** Loads the bundled front-end script, only on pages that render a viewer or a step. */
function ifcvo_enqueue_frontend() {
	wp_enqueue_script( 'ifcvo-frontend', plugins_url( 'frontend.js', __FILE__ ), array(), IFCVO_VERSION, true );
}

/** The data-* attributes the front-end script reads, already escaped. */
function ifcvo_data_attributes( $atts, $settings ) {
	$data = array();
	if ( '1' === (string) $atts['fullscreen'] ) {
		$data['fullscreen'] = '1';
	}
	$field = trim( (string) $atts['form_field'] );
	// Opt-in: filling form fields stays off until the site owner turns it on.
	if ( '' !== $field && '1' === $settings['form_field'] && preg_match( '/^[A-Za-z0-9_\-#.\[\]="\' :]{1,120}$/', $field ) ) {
		$data['form-field'] = $field;
	}
	if ( '1' === $settings['datalayer'] ) {
		$data['datalayer'] = '1';
	}
	$out = '';
	foreach ( $data as $key => $value ) {
		$out .= ' data-ifcvo-' . $key . '="' . esc_attr( $value ) . '"';
	}
	return $out;
}

/** The iframe markup shared by the shortcode and the block. */
function ifcvo_render( $atts, $wrapper = 'class="ifcvo-embed"' ) {
	$atts = ifcvo_apply_settings( shortcode_atts( ifcvo_default_atts(), (array) $atts, 'ifc_viewer' ) );
	$src  = ifcvo_build_embed_url( $atts );
	if ( '' === $src ) {
		if ( current_user_can( 'edit_posts' ) ) {
			return '<p class="ifcvo-notice">' . esc_html__( 'Bimo IFC Viewer: choose an IFC file from the Media Library, or give an https URL to an .ifc file or to a scene.', 'bimo-ifc-viewer' ) . '</p>';
		}
		return '';
	}
	ifcvo_enqueue_frontend();
	$settings = ifcvo_settings();
	$height   = max( 200, min( 2000, absint( $atts['height'] ) ) );
	$title    = '' !== trim( (string) $atts['title'] ) ? $atts['title'] : __( 'Interactive 3D IFC model', 'bimo-ifc-viewer' );
	$wrapper .= ifcvo_data_attributes( $atts, $settings );
	if ( 'click' !== $atts['load'] ) {
		return sprintf(
			'<div %4$s><iframe src="%1$s" width="100%%" height="%2$d" style="border:0;border-radius:12px;max-width:100%%;display:block" loading="lazy" allow="fullscreen" title="%3$s"></iframe></div>',
			esc_url( $src ),
			$height,
			esc_attr( $title ),
			$wrapper
		);
	}

	// Click to load: nothing is requested from ifcvieweronline.eu until the visitor asks.
	$poster  = ifcvo_poster_url( $atts['poster'] );
	$heading = '' !== trim( (string) $atts['poster_title'] ) ? $atts['poster_title'] : $title;
	$text    = trim( (string) $atts['poster_text'] );
	$label   = '' !== trim( (string) $atts['launch_label'] ) ? $atts['launch_label'] : __( 'Load the 3D model', 'bimo-ifc-viewer' );
	$consent = '' !== trim( (string) $settings['consent'] ) ? $settings['consent'] : __( 'The 3D viewer loads from www.ifcvieweronline.eu when you click. Your browser then downloads the model from this site.', 'bimo-ifc-viewer' );
	// The poster takes the iframe's height, so loading the model shifts nothing.
	$style = 'position:relative;height:' . $height . 'px;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;box-sizing:border-box;text-align:center;color:#fff;background:#1d2430';
	$html  = '<div ' . $wrapper . ' data-ifcvo-load="click" data-ifcvo-src="' . esc_url( $src ) . '" data-ifcvo-height="' . esc_attr( (string) $height ) . '" data-ifcvo-title="' . esc_attr( $title ) . '">';
	$html .= '<div class="ifcvo-poster" style="' . esc_attr( $style ) . '">';
	if ( $poster ) {
		$html .= '<img src="' . esc_url( $poster ) . '" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.45;margin:0;max-width:none">';
	}
	$html .= '<p class="ifcvo-poster-title" style="position:relative;margin:0;font-size:1.25em;font-weight:600">' . esc_html( $heading ) . '</p>';
	if ( '' !== $text ) {
		$html .= '<p class="ifcvo-poster-text" style="position:relative;margin:0;max-width:40em">' . esc_html( $text ) . '</p>';
	}
	$html .= '<button type="button" class="ifcvo-launch" style="position:relative;cursor:pointer;padding:10px 18px;border-radius:8px;border:0;font:inherit;font-weight:600;background:#fff;color:#1d2430">' . esc_html( $label ) . '</button>';
	$html .= '<p class="ifcvo-consent" style="position:relative;margin:0;font-size:.8em;opacity:.85;max-width:40em">' . esc_html( $consent ) . '</p>';
	// Without JavaScript the button does nothing: offer a plain link instead.
	$html .= '<noscript><a href="' . esc_url( remove_query_arg( 'embed', $src ) ) . '" target="_blank" rel="noopener" style="position:relative;color:#fff">' . esc_html__( 'Open the model on ifcvieweronline.eu', 'bimo-ifc-viewer' ) . '</a></noscript>';
	$html .= '</div></div>';
	return $html;
}

/**
 * [ifc_step view="front" select="GUID" isolate="IfcWall"]Text[/ifc_step]
 *
 * A paragraph of a guided story: while it crosses the middle of the screen the
 * nearest viewer above it (or the first one below) shows what the step says.
 * Without JavaScript it is plain text.
 */
function ifcvo_step_attributes( $atts ) {
	$atts  = shortcode_atts(
		array(
			'view'      => '',
			'select'    => '',
			'isolate'   => '',
			'azimuth'   => '',
			'elevation' => '',
			'fill'      => '',
		),
		(array) $atts,
		'ifc_step'
	);
	$rules = array(
		'view'      => '/^(iso|top|front|back|left|right|bottom)$/',
		'select'    => '/^[0-9A-Za-z_$]{22}$/',
		'isolate'   => '/^(none|[A-Za-z]{3,60})$/',
		'azimuth'   => '/^-?\d{1,3}(\.\d+)?$/',
		'elevation' => '/^-?\d{1,2}(\.\d+)?$/',
		'fill'      => '/^0?\.\d{1,3}$/',
	);
	$out   = '';
	foreach ( $rules as $key => $rule ) {
		$value = trim( (string) $atts[ $key ] );
		if ( '' !== $value && preg_match( $rule, $value ) ) {
			$out .= ' data-' . $key . '="' . esc_attr( $value ) . '"';
		}
	}
	return $out;
}

function ifcvo_render_step( $atts, $content = '' ) {
	ifcvo_enqueue_frontend();
	return '<div class="ifcvo-step"' . ifcvo_step_attributes( $atts ) . '>' . do_shortcode( (string) $content ) . '</div>';
}
add_shortcode( 'ifc_step', 'ifcvo_render_step' );

/** The step block keeps its inner blocks (the text) as saved content. */
function ifcvo_render_step_block( $atts, $content ) {
	ifcvo_enqueue_frontend();
	return '<div ' . get_block_wrapper_attributes( array( 'class' => 'ifcvo-step' ) ) . ifcvo_step_attributes( $atts ) . '>' . $content . '</div>';
}

/** The block adds its wrapper attributes (wide and full alignment, extra classes). */
function ifcvo_render_block( $atts ) {
	return ifcvo_render( $atts, get_block_wrapper_attributes( array( 'class' => 'ifcvo-embed' ) ) );
}

/** Shortcode callback: WordPress passes the content as the second argument, which is not a wrapper. */
function ifcvo_shortcode( $atts ) {
	return ifcvo_render( $atts );
}
add_shortcode( 'ifc_viewer', 'ifcvo_shortcode' );

/** Gutenberg block (no build step: the editor script uses the wp.* globals). */
function ifcvo_register_block() {
	wp_register_script(
		'ifcvo-block-editor',
		plugins_url( 'block-editor.js', __FILE__ ),
		array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n', 'wp-server-side-render' ),
		IFCVO_VERSION,
		true
	);
	register_block_type(
		__DIR__ . '/block.json',
		array( 'render_callback' => 'ifcvo_render_block' )
	);
	register_block_type(
		__DIR__ . '/step/block.json',
		array( 'render_callback' => 'ifcvo_render_step_block' )
	);
}
add_action( 'init', 'ifcvo_register_block' );

/** WordPress refuses .ifc uploads by default. */
function ifcvo_upload_mimes( $mimes ) {
	if ( current_user_can( 'upload_files' ) ) {
		$mimes['ifc'] = 'application/x-step';
	}
	return $mimes;
}
add_filter( 'upload_mimes', 'ifcvo_upload_mimes' );

/** Some hosts detect IFC as text/plain; accept it when the extension is .ifc. */
function ifcvo_check_filetype( $data, $file, $filename, $mimes ) {
	if ( empty( $data['ext'] ) && 'ifc' === strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) ) && current_user_can( 'upload_files' ) ) {
		$data['ext']  = 'ifc';
		$data['type'] = 'application/x-step';
	}
	return $data;
}
add_filter( 'wp_check_filetype_and_ext', 'ifcvo_check_filetype', 10, 4 );

function ifcvo_is_ifc_attachment( $attachment_id ) {
	if ( 'attachment' !== get_post_type( $attachment_id ) ) {
		return false;
	}
	$path = get_attached_file( $attachment_id );
	return $path && 'ifc' === strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
}

/**
 * GET /wp-json/bimo-ifc-viewer/v1/file/<id>
 *
 * Serves a published IFC attachment with the CORS header the viewer needs:
 * the iframe runs on www.ifcvieweronline.eu and fetches the file from this
 * site. Only .ifc attachments, only when the attachment (or the post it
 * belongs to) is public.
 */
function ifcvo_register_routes() {
	register_rest_route(
		'bimo-ifc-viewer/v1',
		'/file/(?P<id>\d+)',
		array(
			'methods'             => 'GET',
			'callback'            => 'ifcvo_serve_file',
			'permission_callback' => '__return_true',
			'args'                => array(
				'id' => array(
					'validate_callback' => function ( $value ) {
						return is_numeric( $value );
					},
				),
			),
		)
	);
}
add_action( 'rest_api_init', 'ifcvo_register_routes' );

function ifcvo_attachment_is_public( $attachment_id ) {
	$parent = wp_get_post_parent_id( $attachment_id );
	if ( $parent ) {
		return 'publish' === get_post_status( $parent ) && '' === get_post_field( 'post_password', $parent );
	}
	// Unattached media: as public as the file URL itself already is. WordPress
	// reports an unattached attachment as 'publish' (its stored status is 'inherit').
	return in_array( get_post_status( $attachment_id ), array( 'inherit', 'publish' ), true );
}

function ifcvo_serve_file( WP_REST_Request $request ) {
	$id = absint( $request['id'] );
	if ( ! ifcvo_is_ifc_attachment( $id ) || ! ifcvo_attachment_is_public( $id ) ) {
		return new WP_Error( 'ifcvo_not_found', 'Not found', array( 'status' => 404 ) );
	}
	$path = get_attached_file( $id );
	if ( ! $path || ! is_readable( $path ) ) {
		return new WP_Error( 'ifcvo_not_found', 'Not found', array( 'status' => 404 ) );
	}
	nocache_headers();
	header( 'Access-Control-Allow-Origin: ' . IFCVO_APP_ORIGIN );
	header( 'Vary: Origin' );
	header( 'Content-Type: application/x-step' );
	header( 'Content-Length: ' . filesize( $path ) );
	header( 'Content-Disposition: inline; filename="' . rawurlencode( wp_basename( $path ) ) . '"' );
	header( 'Cache-Control: public, max-age=3600' );
	header( 'X-Content-Type-Options: nosniff' );
	// Stream without loading the whole model into memory: WP_Filesystem has no
	// streaming read, and get_contents() would hold a 500 MB model in memory.
	// phpcs:disable WordPress.WP.AlternativeFunctions
	$handle = fopen( $path, 'rb' );
	if ( $handle ) {
		while ( ! feof( $handle ) ) {
			echo fread( $handle, 1048576 ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- binary file.
			flush();
		}
		fclose( $handle );
	}
	// phpcs:enable WordPress.WP.AlternativeFunctions
	exit;
}

/*
 * Settings → Bimo IFC Viewer: site-wide defaults. Every embed can override them.
 */
function ifcvo_sanitize_settings( $input ) {
	$input = is_array( $input ) ? $input : array();
	$rules = ifcvo_param_rules();
	$out   = array();
	foreach ( array( 'accent', 'lang', 'ui', 'bg' ) as $key ) {
		$value       = isset( $input[ $key ] ) ? sanitize_text_field( wp_unslash( $input[ $key ] ) ) : '';
		$rule        = $rules[ $key ];
		$ok          = is_array( $rule ) ? in_array( $value, $rule, true ) : (bool) preg_match( $rule, $value );
		$out[ $key ] = $ok ? $value : '';
	}
	$out['load']       = isset( $input['load'] ) && 'click' === $input['load'] ? 'click' : 'auto';
	$poster            = isset( $input['poster'] ) ? trim( sanitize_text_field( wp_unslash( $input['poster'] ) ) ) : '';
	$out['poster']     = ctype_digit( $poster ) ? (string) absint( $poster ) : esc_url_raw( $poster, array( 'https' ) );
	$out['consent']    = isset( $input['consent'] ) ? sanitize_textarea_field( wp_unslash( $input['consent'] ) ) : '';
	$out['form_field'] = empty( $input['form_field'] ) ? '0' : '1';
	$out['datalayer']  = empty( $input['datalayer'] ) ? '0' : '1';
	return $out;
}

function ifcvo_register_settings() {
	register_setting(
		'ifcvo_settings_group',
		'ifcvo_settings',
		array(
			'type'              => 'array',
			'sanitize_callback' => 'ifcvo_sanitize_settings',
			'default'           => array(),
		)
	);
}
add_action( 'admin_init', 'ifcvo_register_settings' );

function ifcvo_settings_menu() {
	add_options_page(
		__( 'Bimo IFC Viewer', 'bimo-ifc-viewer' ),
		__( 'Bimo IFC Viewer', 'bimo-ifc-viewer' ),
		'manage_options',
		'bimo-ifc-viewer',
		'ifcvo_settings_page'
	);
}
add_action( 'admin_menu', 'ifcvo_settings_menu' );

function ifcvo_settings_link( $links ) {
	$links[] = '<a href="' . esc_url( admin_url( 'options-general.php?page=bimo-ifc-viewer' ) ) . '">' . esc_html__( 'Settings', 'bimo-ifc-viewer' ) . '</a>';
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'ifcvo_settings_link' );

/** One select box of the settings page. */
function ifcvo_settings_select( $key, $value, $options ) {
	echo '<select id="ifcvo-' . esc_attr( $key ) . '" name="ifcvo_settings[' . esc_attr( $key ) . ']">';
	foreach ( $options as $option => $label ) {
		echo '<option value="' . esc_attr( $option ) . '"' . selected( $value, $option, false ) . '>' . esc_html( $label ) . '</option>';
	}
	echo '</select>';
}

function ifcvo_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$s     = ifcvo_settings();
	$rules = ifcvo_param_rules();
	$langs = array( '' => __( 'Visitor language', 'bimo-ifc-viewer' ) );
	foreach ( $rules['lang'] as $lang ) {
		$langs[ $lang ] = $lang;
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Bimo IFC Viewer', 'bimo-ifc-viewer' ); ?></h1>
		<p><?php esc_html_e( 'Defaults for every IFC Viewer block and [ifc_viewer] shortcode of this site. A setting given on a block or shortcode wins.', 'bimo-ifc-viewer' ); ?></p>
		<form method="post" action="options.php">
			<?php settings_fields( 'ifcvo_settings_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ifcvo-ui"><?php esc_html_e( 'Interface', 'bimo-ifc-viewer' ); ?></label></th>
					<td>
					<?php
					ifcvo_settings_select(
						'ui',
						$s['ui'],
						array(
							''        => __( 'Article (default)', 'bimo-ifc-viewer' ),
							'minimal' => __( 'Minimal', 'bimo-ifc-viewer' ),
							'full'    => __( 'Full app', 'bimo-ifc-viewer' ),
							'kiosk'   => __( 'Kiosk', 'bimo-ifc-viewer' ),
							'client'  => __( 'Client presentation', 'bimo-ifc-viewer' ),
						)
					);
					?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="ifcvo-lang"><?php esc_html_e( 'Language', 'bimo-ifc-viewer' ); ?></label></th>
					<td><?php ifcvo_settings_select( 'lang', $s['lang'], $langs ); ?></td>
				</tr>
				<tr>
					<th scope="row"><label for="ifcvo-accent"><?php esc_html_e( 'Accent colour (hex)', 'bimo-ifc-viewer' ); ?></label></th>
					<td><input type="text" id="ifcvo-accent" name="ifcvo_settings[accent]" value="<?php echo esc_attr( $s['accent'] ); ?>" placeholder="#3366ff" class="regular-text"></td>
				</tr>
				<tr>
					<th scope="row"><label for="ifcvo-bg"><?php esc_html_e( 'Background', 'bimo-ifc-viewer' ); ?></label></th>
					<td><input type="text" id="ifcvo-bg" name="ifcvo_settings[bg]" value="<?php echo esc_attr( $s['bg'] ); ?>" placeholder="paper" class="regular-text">
					<p class="description"><?php esc_html_e( 'white, paper, blueprint, sky, studio, or one or two hex colours without # (top,bottom).', 'bimo-ifc-viewer' ); ?></p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ifcvo-load"><?php esc_html_e( 'Loading', 'bimo-ifc-viewer' ); ?></label></th>
					<td>
					<?php
					ifcvo_settings_select(
						'load',
						$s['load'],
						array(
							'auto'  => __( 'Load the viewer with the page', 'bimo-ifc-viewer' ),
							'click' => __( 'Show a poster; load the viewer when the visitor clicks', 'bimo-ifc-viewer' ),
						)
					);
					?>
					<p class="description"><?php esc_html_e( 'With click to load, nothing is requested from ifcvieweronline.eu until the visitor asks for the model.', 'bimo-ifc-viewer' ); ?></p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ifcvo-poster"><?php esc_html_e( 'Default poster image', 'bimo-ifc-viewer' ); ?></label></th>
					<td><input type="text" id="ifcvo-poster" name="ifcvo_settings[poster]" value="<?php echo esc_attr( $s['poster'] ); ?>" class="regular-text">
					<p class="description"><?php esc_html_e( 'A Media Library ID or an https image URL.', 'bimo-ifc-viewer' ); ?></p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ifcvo-consent"><?php esc_html_e( 'Consent text on the poster', 'bimo-ifc-viewer' ); ?></label></th>
					<td><textarea id="ifcvo-consent" name="ifcvo_settings[consent]" rows="3" class="large-text"><?php echo esc_textarea( $s['consent'] ); ?></textarea>
					<p class="description"><?php esc_html_e( 'Leave empty for the default note that the viewer loads from www.ifcvieweronline.eu.', 'bimo-ifc-viewer' ); ?></p></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Form fields', 'bimo-ifc-viewer' ); ?></th>
					<td><label><input type="checkbox" name="ifcvo_settings[form_field]" value="1" <?php checked( '1', $s['form_field'] ); ?>> <?php esc_html_e( 'Fill a form field with the selected element (form_field="#css-selector" on the embed)', 'bimo-ifc-viewer' ); ?></label></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Analytics', 'bimo-ifc-viewer' ); ?></th>
					<td><label><input type="checkbox" name="ifcvo_settings[datalayer]" value="1" <?php checked( '1', $s['datalayer'] ); ?>> <?php esc_html_e( 'Push viewer events to window.dataLayer (Google Tag Manager), if the page has one', 'bimo-ifc-viewer' ); ?></label></td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
