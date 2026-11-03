<?php
/**
 * Plugin Name:       IFC Viewer Online
 * Plugin URI:        https://github.com/j03rul4nd/ifc-viewer-online/tree/main/integrations/wordpress
 * Description:       Embed interactive 3D IFC (BIM) models in posts and pages: Health Score, federated models, point clouds, the model on the map, sun studies, plan cuts and digital twin scenes. Block and [ifc_viewer] shortcode.
 * Version:           1.1.0
 * Requires at least: 6.1
 * Requires PHP:      7.4
 * Author:            IFC Viewer Online
 * Author URI:        https://www.ifcvieweronline.eu/
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       ifc-viewer-online
 *
 * The viewer runs in the visitor's browser inside an iframe served by
 * www.ifcvieweronline.eu. The IFC file is fetched by that browser straight
 * from this site: nothing is uploaded to IFC Viewer Online.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'IFCVO_VERSION', '1.1.0' );
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
	);
}

/** Shortcode / block attributes and their defaults. */
function ifcvo_default_atts() {
	return array(
		'model'      => '',
		'attachment' => 0,
		'name'       => '',
		'height'     => 600,
		'ui'         => 'article',
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
	);
}

/** "a, b,,c" → array( 'a', 'b', 'c' ). Block and shortcode both give lists as comma-separated text. */
function ifcvo_list( $value ) {
	return array_values( array_filter( array_map( 'trim', explode( ',', (string) $value ) ), 'strlen' ) );
}

/** The CORS-enabled route for an IFC attachment of this site, or '' when it is not one. */
function ifcvo_attachment_route( $attachment_id ) {
	return $attachment_id && ifcvo_is_ifc_attachment( $attachment_id ) ? rest_url( 'ifc-viewer-online/v1/file/' . $attachment_id ) : '';
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

/** The iframe markup shared by the shortcode and the block. */
function ifcvo_render( $atts, $wrapper = 'class="ifcvo-embed"' ) {
	$atts = shortcode_atts( ifcvo_default_atts(), (array) $atts, 'ifc_viewer' );
	$src  = ifcvo_build_embed_url( $atts );
	if ( '' === $src ) {
		if ( current_user_can( 'edit_posts' ) ) {
			return '<p class="ifcvo-notice">' . esc_html__( 'IFC Viewer Online: choose an IFC file from the Media Library, or give an https URL to an .ifc file or to a scene.', 'ifc-viewer-online' ) . '</p>';
		}
		return '';
	}
	$height = max( 200, min( 2000, absint( $atts['height'] ) ) );
	$title  = '' !== trim( (string) $atts['title'] ) ? $atts['title'] : __( 'Interactive 3D IFC model', 'ifc-viewer-online' );
	return sprintf(
		'<div %4$s><iframe src="%1$s" width="100%%" height="%2$d" style="border:0;border-radius:12px;max-width:100%%;display:block" loading="lazy" allow="fullscreen" title="%3$s"></iframe></div>',
		esc_url( $src ),
		$height,
		esc_attr( $title ),
		$wrapper
	);
}

/** The block adds its wrapper attributes (wide and full alignment, extra classes). */
function ifcvo_render_block( $atts ) {
	return ifcvo_render( $atts, get_block_wrapper_attributes( array( 'class' => 'ifcvo-embed' ) ) );
}

add_shortcode( 'ifc_viewer', 'ifcvo_render' );

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
 * GET /wp-json/ifc-viewer-online/v1/file/<id>
 *
 * Serves a published IFC attachment with the CORS header the viewer needs:
 * the iframe runs on www.ifcvieweronline.eu and fetches the file from this
 * site. Only .ifc attachments, only when the attachment (or the post it
 * belongs to) is public.
 */
function ifcvo_register_routes() {
	register_rest_route(
		'ifc-viewer-online/v1',
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
