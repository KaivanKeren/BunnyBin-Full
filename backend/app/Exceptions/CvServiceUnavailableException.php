<?php

namespace App\Exceptions;

use Exception;

class CvServiceUnavailableException extends Exception
{
    public function __construct()
    {
        parent::__construct('CV service tidak dapat dihubungi.');
    }
}
