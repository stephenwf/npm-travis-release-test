#!/usr/bin/env bash
if [[ "$TRAVIS_BRANCH" = "master" ]] && [[ "$TRAVIS_PULL_REQUEST" = "false" ]]; then
    if [[ "$TRAVIS_TAG" = "$TRAVIS_BRANCH" ]]; then
        echo "DEPLOYING A TAG!";
    else
        echo "DEPLOYING A NEXT";
    fi
fi
if [[ "$TRAVIS_PULL_REQUEST" != "false" ]]; then
    echo "DEPLOYING A CANARY, NUMBER $TRAVIS_PULL_REQUEST";
fi