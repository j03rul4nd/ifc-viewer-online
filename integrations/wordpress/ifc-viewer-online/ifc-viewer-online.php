<?php
/**
 * Plugin Name:       IFC Viewer Online
 * Plugin URI:        https://www.ifcvieweronline.eu/
 * Description:       Embed interactive 3D IFC (BIM) models in posts and pages, with the Health Score, measurement and validation of IFC Viewer Online. Block and [ifc_viewer] shortcode.
 * Version:           1.0.0
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

define( 'IFCVO_VERSION', '1.0.0' );
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
	);
}

/**
 * A model URL the viewer can fetch: an attachment of this site (served through
 * the CORS-enabled REST route below) or any https URL.
 */
function ifcvo_resolve_model_url( $atts ) {
	$attachment_id = absint( $atts['attachment'] );
	if ( $attachment_id && ifcvo_is_ifc_attachment( $attachment_id ) ) {
		return rest_url( 'ifc-viewer-online/v1/file/' . $attachment_id );
	}
	$url = trim( (string) $atts['model'] );
	if ( '' === $url ) {
		return '';
	}
	// A URL of this site's own uploads goes through the REST route too, so the
	// viewer (another origin) is allowed to read it.
	$attachment_id = attachment_url_to_postid( $url );
	if ( $attachment_id && ifcvo_is_ifc_attachment( $attachment_id ) ) {
		return rest_url( 'ifc-viewer-online/v1/file/' . $attachment_id );
	}
	$url = esc_url_raw( $url, array( 'https' ) );
	return $url ? $url : '';
}

/** Build the viewer URL from validated attributes only. */
function ifcvo_build_embed_url( $atts ) {
	$model = ifcvo_resolve_model_url( $atts );
	if ( '' === $model ) {
		return '';
	}
	$query = array(
		'model' => $model,
		'embed' => '1',
	);
	$name = sanitize_text_field( (string) $atts['name'] );
	if ( '' !== $name ) {
		$query['name'] = $name;
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
		if ( 'validate' === $key && '1' === $value ) {
			continue;
		}
		if ( 'ui' === $key && 'minimal' === $value ) {
			continue;
		}
		$query[ $key ] = $value;
	}
	return add_query_arg( array_map( 'rawurlencode', $query ), IFCVO_APP_URL );
}

/** The iframe markup shared by the shortcode and the block. */
function ifcvo_render( $atts ) {
	$atts = shortcode_atts( ifcvo_default_atts(), (array) $atts, 'ifc_viewer' );
	$src  = ifcvo_build_embed_url( $atts );
	if ( '' === $src ) {
		if ( current_user_can( 'edit_posts' ) ) {
			return '<p class="ifcvo-notice">' . esc_html__( 'IFC Viewer Online: choose an IFC file from the Media Library or give an https URL to an .ifc file.', 'ifc-viewer-online' ) . '</p>';
		}
		return '';
	}
	$height = max( 200, min( 2000, absint( $atts['height'] ) ) );
	$title  = '' !== trim( (string) $atts['title'] ) ? $atts['title'] : __( 'Interactive 3D IFC model', 'ifc-viewer-online' );
	return sprintf(
		'<div class="ifcvo-embed"><iframe src="%1$s" width="100%%" height="%2$d" style="border:0;border-radius:12px;max-width:100%%;display:block" loading="lazy" allow="fullscreen" title="%3$s"></iframe></div>',
		esc_url( $src ),
		$height,
		esc_attr( $title )
	);
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
		array( 'render_callback' => 'ifcvo_render' )
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
				'id' => array( 'validate_callback' => 'is_numeric' ),
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
	// Unattached media: as public as the file URL itself already is.
	return 'inherit' === get_post_status( $attachment_id );
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
	// Stream without loading the whole model into memory.
	$handle = fopen( $path, 'rb' );
	if ( $handle ) {
		while ( ! feof( $handle ) ) {
			echo fread( $handle, 1048576 ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- binary file.
			flush();
		}
		fclose( $handle );
	}
	exit;
}
