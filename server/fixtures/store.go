package fixtures

import (
	"fmt"
	"sync"
)

// Store is a thread-safe fixture registry seeded from the generated Library.
// New fixtures can be added at runtime via Add (in-memory only).
type Store struct {
	mu       sync.RWMutex
	fixtures map[string]Fixture
}

// NewStore creates a Store populated with all entries from the generated Library.
func NewStore() *Store {
	m := make(map[string]Fixture, len(Library))
	for k, v := range Library {
		m[k] = v
	}
	return &Store{fixtures: m}
}

// All returns a snapshot of all fixtures.
func (s *Store) All() map[string]Fixture {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]Fixture, len(s.fixtures))
	for k, v := range s.fixtures {
		out[k] = v
	}
	return out
}

// Get returns a single fixture by key, or false if not found.
func (s *Store) Get(key string) (Fixture, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	f, ok := s.fixtures[key]
	return f, ok
}

// Add inserts a fixture. Returns an error if the key already exists.
func (s *Store) Add(key string, f Fixture) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.fixtures[key]; exists {
		return fmt.Errorf("fixture %q already exists", key)
	}
	s.fixtures[key] = f
	return nil
}
