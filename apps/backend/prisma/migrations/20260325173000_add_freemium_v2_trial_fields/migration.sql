ALTER TABLE "users"
ADD COLUMN "dataAuthorizationAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dataAuthorizationAcceptedAt" TIMESTAMP(3),
ADD COLUMN "privacyPolicyVersion" TEXT;

ALTER TABLE "subscriptions"
ADD COLUMN "freemiumPolicy" TEXT NOT NULL DEFAULT 'LEGACY_5_BUSINESS_DAYS',
ADD COLUMN "freemiumExpiresAt" TIMESTAMP(3);