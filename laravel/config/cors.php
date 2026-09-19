<?php

/*
| Same policy as Express's `cors({ origin: FRONTEND_URL })`: only the
| frontend's own origin may call the API from a browser. In production
| the SPA and the API share one origin behind Nginx, so this mostly
| matters for the Vite dev server and staging.
*/
return [
    'paths' => ['api/*', 'uploads/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_filter(array_map('trim', explode(',', (string) env('FRONTEND_URL', 'https://bonapinta.com')))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
