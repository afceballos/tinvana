<?php
$image=imagecreatetruecolor(2400,1200);imagepng($image,dirname(__DIR__,2).'/.tools/upload-test.png');imagedestroy($image);
