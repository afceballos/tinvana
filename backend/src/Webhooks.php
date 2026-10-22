<?php
declare(strict_types=1);
namespace App;

final class Webhooks
{
    public static function validateUrl(mixed $value): string
    {
        $url = Support::text($value, 4096);
        $parts = parse_url($url);
        if (!Support::url($url) || !$parts || ($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
            || ($parts['port'] ?? 443) !== 443) {
            throw new HttpError(422, 'Usa un webhook HTTPS en el puerto 443, sin usuario, contraseña o fragmento en la URL.');
        }
        $host = strtolower(trim($parts['host'] ?? '', '[]'));
        if ($host === 'localhost' || (!filter_var($host, FILTER_VALIDATE_IP) && !str_contains($host, '.')) || str_ends_with($host, '.local')
            || str_ends_with($host, '.localhost') || str_ends_with($host, '.internal')
            || str_contains($host, '%')) {
            throw new HttpError(422, 'El webhook debe usar un destino público.');
        }
        if (filter_var($host, FILTER_VALIDATE_IP) && !self::publicIp($host)) {
            throw new HttpError(422, 'El webhook debe usar un destino público.');
        }
        return $url;
    }

    public static function publicIp(string $ip): bool
    {
        $packed = @inet_pton($ip);
        if ($packed !== false && strlen($packed) === 16
            && substr($packed, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
            $ip = inet_ntop(substr($packed, 12));
        }
        $flags=defined('FILTER_FLAG_GLOBAL_RANGE') ? FILTER_FLAG_GLOBAL_RANGE : FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
        return filter_var($ip, FILTER_VALIDATE_IP, $flags) !== false;
    }

    public static function view(string $owner): array
    {
        $row = Database::one('SELECT provider,enabled,url_ciphertext FROM webhook_settings WHERE user_id=?', [$owner]);
        $display = null;
        if ($row) {
            $url = Crypto::decrypt($row['url_ciphertext'], 'webhook-url:' . $owner);
            $display = 'https://' . parse_url($url, PHP_URL_HOST) . '/•••• · ' . substr(hash('sha256', $url), 0, 8);
        }
        return ['configured' => (bool)$row, 'provider' => $row['provider'] ?? 'ghl',
            'display_url' => $display,
            'enabled' => $row ? in_array($row['enabled'], [true, 1, '1', 't'], true) : false];
    }

    public static function remove(string $owner): array
    {
        Database::query('DELETE FROM webhook_settings WHERE user_id=?', [$owner]);
        return self::view($owner);
    }

    public static function save(string $owner, array $body): array
    {
        $provider = $body['provider'] ?? 'ghl';
        $enabled = $body['enabled'] ?? true;
        if (!in_array($provider, ['ghl', 'generic'], true) || !is_bool($enabled)) {
            throw new HttpError(422, 'Configuración de webhook inválida.');
        }
        $row = Database::one('SELECT url_ciphertext FROM webhook_settings WHERE user_id=?', [$owner]);
        $url = Support::text($body['url'] ?? '', 4096, false);
        if ($url === '' && !$row) throw new HttpError(422, 'Introduce la URL del webhook para conectar el formulario.');
        $cipher = $url !== '' ? Crypto::encrypt(self::validateUrl($url), 'webhook-url:' . $owner) : $row['url_ciphertext'];
        $enabledValue=Database::driver()==='mysql'?($enabled?1:0):($enabled?'true':'false');
        Database::query('INSERT INTO webhook_settings(user_id,provider,url_ciphertext,enabled) VALUES(?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,url_ciphertext=excluded.url_ciphertext,
            enabled=excluded.enabled,updated_at=now()', [$owner, $provider, $cipher, $enabledValue]);
        return self::view($owner);
    }

    /** Pin a validated public DNS address so a user-configured webhook cannot reach private services. */
    public static function destination(string $url): array
    {
        self::validateUrl($url);
        $host = strtolower(trim((string)parse_url($url, PHP_URL_HOST), '[]'));
        if (filter_var($host, FILTER_VALIDATE_IP)) return ['host' => $host, 'resolve' => null];
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        $ips = [];
        foreach ($records ?: [] as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (!$ip) continue;
            if (!self::publicIp($ip)) throw new HttpError(422, 'El destino del webhook resuelve a una red no permitida.');
            $ips[] = str_contains($ip, ':') ? '[' . $ip . ']' : $ip;
        }
        if (!$ips) throw new HttpError(422, 'No se pudo resolver el destino del webhook.');
        return ['host' => $host, 'resolve' => $host . ':443:' . implode(',', array_unique($ips))];
    }

    /** Only codes and generic errors leave this method; never the secret URL or response body. */
    public static function send(string $url, array $payload, string $leadId): array
    {
        try { $destination = self::destination($url); }
        catch (HttpError $error) { return ['http' => 0, 'ok' => false, 'error' => $error->getMessage()]; }
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => Support::json($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'Idempotency-Key: ' . $leadId],
            CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => min(60, max(5, (int)Support::env('GHL_TIMEOUT', '15'))),
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            // Validate and connect directly to the same public destination, bypassing DNS-changing proxies.
            CURLOPT_PROXY => '',
        ]);
        if ($destination['resolve']) curl_setopt($curl, CURLOPT_RESOLVE, [$destination['resolve']]);
        if (Support::env('HTTP_CA_BUNDLE') !== '') curl_setopt($curl, CURLOPT_CAINFO, Support::env('HTTP_CA_BUNDLE'));
        $response = curl_exec($curl);
        $http = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $errno = curl_errno($curl);
        curl_close($curl);
        $ok = $response !== false && $http >= 200 && $http < 300;
        return ['http' => $http, 'ok' => $ok, 'error' => $ok ? null : ($errno ? 'Error de transporte cURL ' . $errno : 'El webhook respondió HTTP ' . $http)];
    }
}
