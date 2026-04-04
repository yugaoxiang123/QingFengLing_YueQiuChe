using UnityEngine;

/// <summary>
/// Put this on the GameObject that has the car's body <see cref="Collider"/> if AirWall alarm / boundary fade
/// do not fire from scripts on the Rigidbody root (some setups only deliver contacts to the collider object).
/// Forwards enter/exit to <see cref="CarInputUIAndAudioFeedback"/> and <see cref="AirWallBoundaryFade"/> on parents.
/// </summary>
[DisallowMultipleComponent]
public class CarAirWallContactRelay : MonoBehaviour
{
    private CarInputUIAndAudioFeedback feedback;
    private AirWallBoundaryFade boundaryFade;

    private void Awake()
    {
        feedback = GetComponentInParent<CarInputUIAndAudioFeedback>();
        boundaryFade = GetComponentInParent<AirWallBoundaryFade>();
    }

    private void OnTriggerEnter(Collider other)
    {
        feedback?.NotifyAirWallTriggerEnter(other);
        boundaryFade?.NotifyAirWallTriggerEnter(other);
    }

    private void OnTriggerExit(Collider other)
    {
        feedback?.NotifyAirWallTriggerExit(other);
        boundaryFade?.NotifyAirWallTriggerExit(other);
    }

    private void OnCollisionEnter(Collision collision)
    {
        feedback?.NotifyAirWallCollisionEnter(collision);
        boundaryFade?.NotifyAirWallCollisionEnter(collision);
    }

    private void OnCollisionExit(Collision collision)
    {
        feedback?.NotifyAirWallCollisionExit(collision);
        boundaryFade?.NotifyAirWallCollisionExit(collision);
    }
}
