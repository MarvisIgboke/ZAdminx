<?php

/*
 * Structured exceptions for Z Admin (classmap autoloaded).
 * Rendering lives in bootstrap/app.php.
 */

namespace App\Exceptions;

use Exception;

/** ZVend refused, timed out or was unreachable. Never includes secrets. */
class ZVendException extends Exception
{
    public function __construct(
        string $message,
        public readonly string $endpoint = '',
        public readonly ?string $responseCode = null,
    ) {
        parent::__construct($message);
    }
}

/** A workflow rule rejected the transition (wrong stage, wrong actor, bad decision). */
class WorkflowException extends Exception
{
    public function __construct(string $message, private readonly string $code = 'WORKFLOW_INVALID_TRANSITION')
    {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->code;
    }

    public static function notYourStage(string $expected): self
    {
        return new self("This record is not awaiting your action (expected stage: {$expected}).", 'WORKFLOW_WRONG_STAGE');
    }

    public static function illegalDecision(string $decision): self
    {
        return new self("'{$decision}' is not permitted at this stage.", 'WORKFLOW_ILLEGAL_DECISION');
    }

    public static function terminal(): self
    {
        return new self('This record has reached a terminal state and can no longer transition.', 'WORKFLOW_TERMINAL');
    }
}

/** The idempotency key was already consumed — replay the original outcome. */
class IdempotencyReplayException extends Exception
{
    public function __construct(public readonly ?array $snapshot = null)
    {
        parent::__construct('Idempotent request already processed.');
    }
}
