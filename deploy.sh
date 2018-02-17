#!/usr/bin/env bash

echo "//registry.npmjs.org/:_authToken=${NPM_AUTH}" >> ~/.npmrc

if [[ "$TRAVIS_BRANCH" = "master" ]] && [[ "$TRAVIS_PULL_REQUEST" = "false" ]]; then
    if [[ "$TRAVIS_TAG" = "$TRAVIS_BRANCH" ]]; then
        echo "SKIPPING BUILDING TAG ON MASTER";
    else
        npm run release -- --next --yes
    fi
fi

if [[ "${TRAVIS_TAG}" != "" ]]; then
    echo "DEPLOYING A TAG!";
fi

if [[ "$TRAVIS_PULL_REQUEST" != "false" ]]; then
    echo "DEPLOYING A CANARY, NUMBER $TRAVIS_PULL_REQUEST";
fi