<?php

namespace App\Policies;

use App\Models\OperationModel;
use App\Models\User;

/**
 * One policy for all five operations — capability names are derived from the
 * operation type ({verb}_{operation}), matching the seeded permission matrix.
 * Stage-level ownership is enforced separately by the WorkflowEngine; this
 * policy is the model-level gate.
 */
class OperationPolicy
{
    public function viewAny(User $user, string $type): bool
    {
        return $user->hasPermission("view_{$type}");
    }

    public function view(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('view_'.$operation->type()->value);
    }

    public function create(User $user, string $type): bool
    {
        return $user->hasPermission("create_{$type}");
    }

    public function approve(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('approve_'.$operation->type()->value);
    }

    public function reject(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('reject_'.$operation->type()->value);
    }

    public function return(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('return_'.$operation->type()->value);
    }

    public function execute(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('execute_'.$operation->type()->value);
    }

    public function release(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('release_meter_installation');
    }

    public function viewHistory(User $user, OperationModel $operation): bool
    {
        return $user->hasPermission('view_history_'.$operation->type()->value);
    }
}
