<?php
$data = json_decode(file_get_contents('/tmp/msgverify_out.json'), true);
file_put_contents('/tmp/msgverify_fields.txt', implode("\n", [$data['u1'], $data['u2'], $data['t1'], $data['t2']]));
echo "ok";
