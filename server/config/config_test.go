package config

import (
	"strings"
	"testing"
)

func fixtureResolver(key string) int {
	switch key {
	case "generic/rgbaw-6ch":
		return 6
	case "generic/moving-head-8ch":
		return 8
	case "generic/rgb-3ch":
		return 3
	default:
		return 0
	}
}

func TestValidatePatches_NoOverlap(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "generic/rgbaw-6ch", Label: "Front Par", StartAddress: 1},
		{FixtureKey: "generic/rgb-3ch", Label: "Back Par", StartAddress: 7},
	}
	if err := ValidatePatches(patches, fixtureResolver); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestValidatePatches_Overlap(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "generic/rgbaw-6ch", Label: "Front Par", StartAddress: 1},
		{FixtureKey: "generic/rgb-3ch", Label: "Back Par", StartAddress: 5},
	}
	err := ValidatePatches(patches, fixtureResolver)
	if err == nil {
		t.Fatal("expected overlap error, got nil")
	}
	if !strings.Contains(err.Error(), "conflict") {
		t.Fatalf("expected conflict error, got: %v", err)
	}
}

func TestValidatePatches_ManualFixture(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "manual", Label: "Custom RGB", StartAddress: 1, Channels: []string{"Red", "Green", "Blue"}},
	}
	if err := ValidatePatches(patches, fixtureResolver); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestValidatePatches_ExceedsDMXRange(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "generic/moving-head-8ch", Label: "Mover", StartAddress: 510},
	}
	err := ValidatePatches(patches, fixtureResolver)
	if err == nil {
		t.Fatal("expected range error, got nil")
	}
	if !strings.Contains(err.Error(), "exceeds DMX range") {
		t.Fatalf("expected DMX range error, got: %v", err)
	}
}
