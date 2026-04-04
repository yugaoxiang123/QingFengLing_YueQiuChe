using UnityEngine;
using System.Collections.Generic;
using System.Collections;

[System.Serializable]
public class WheelInfo
{
    public WheelCollider collider;
    public Transform visualMesh;
    public bool motor;
    public bool steering;
}

public class CarWheelController : MonoBehaviour
{
    private static readonly int ResetParamId = Animator.StringToHash("Reset");

    [Header("Wheel Settings")]
    public List<WheelInfo> wheelInfos;
    public float maxMotorTorque = 500f;
    public float maxSteeringAngle = 30f;
    public float steeringOnlyMotorInput = 1f;
    public float steeringSensitivity = 0.8f;

    [Header("Animation & Cargo")]
    public Animator animator;
    public GameObject cargoObject;
    [Tooltip("Optional. If empty, searches children. Assign when this script is not parent of CarInputUIAndAudioFeedback.")]
    [SerializeField] private CarInputUIAndAudioFeedback inputFeedback;

    private bool isInLoadingZone = false;
    private bool isInUnloadingZone = false;
    private bool isHaveGoods = false;
    private bool CanController = true;
    private int ClickCount = 0;

    private Rigidbody rb;
    private bool lastResetBool;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
        if (inputFeedback == null)
            inputFeedback = GetComponentInChildren<CarInputUIAndAudioFeedback>(true);
        if (cargoObject != null) cargoObject.SetActive(false);

        animator.SetBool(ResetParamId, true);
        if (animator != null)
            lastResetBool = animator.GetBool(ResetParamId);
    }

    void LateUpdate()
    {
        if (animator == null || inputFeedback == null) return;

        bool reset = animator.GetBool(ResetParamId);
        if (reset && !lastResetBool)
            inputFeedback.PlayCargoUnloadSound();

        lastResetBool = reset;
    }

    void Update()
    {
        if (!CanController) return;

        float motorInput = Input.GetAxis("Vertical");
        float steerInput = Input.GetAxis("Horizontal");

        if (Mathf.Abs(motorInput) <= 0.1f && Mathf.Abs(steerInput) > 0.1f)
        {
            motorInput = steeringOnlyMotorInput;
            if (rb != null) rb.WakeUp();
        }

        if (Mathf.Abs(motorInput) > 0.1f || Mathf.Abs(steerInput) > 0.1f)
        {
            animator.SetBool(ResetParamId, true);
            ClickCount = 0;
        }

        float motor = (CanController) ? maxMotorTorque * motorInput : 0;
        float steering = maxSteeringAngle * steerInput * steeringSensitivity;

        foreach (WheelInfo wheel in wheelInfos)
        {
            if (wheel.collider == null || wheel.visualMesh == null) continue;

            if (wheel.steering) wheel.collider.steerAngle = steering;
            if (wheel.motor) wheel.collider.motorTorque = motor;

            ApplyLocalPositionToVisuals(wheel.collider, wheel.visualMesh);
        }

        bool keyQ = Input.GetKeyDown(KeyCode.Q);
        bool keyE = Input.GetKeyDown(KeyCode.E);
        bool loadHandled = keyQ && isInLoadingZone && !isHaveGoods;
        bool unloadHandled = keyE && isInUnloadingZone && isHaveGoods;

        if (loadHandled)
        {
            HandleAction("Load", true);
            ClickCount = 0;
        }

        if (unloadHandled)
        {
            HandleAction("Unload", false);
            ClickCount = 0;
        }

        // Wrong / extra Q|E in zone (e.g. Q in unload zone): count toward reset guard only — never after a valid load/unload on the same frame.
        if ((isInLoadingZone || isInUnloadingZone) && (keyQ || keyE) && !loadHandled && !unloadHandled)
        {
            ClickCount++;
            if (ClickCount > 1)
                animator.SetBool(ResetParamId, true);
        }
    }

    private void HandleAction(string triggerName, bool nextGoodsState)
    {
        if (inputFeedback != null)
            inputFeedback.PlayCargoLoadSound();

        StopCarImmediately();

        animator.SetBool(ResetParamId, false);
        animator.ResetTrigger("Load");
        animator.ResetTrigger("Unload");
        animator.SetTrigger(triggerName);

        isHaveGoods = nextGoodsState;

        StopAllCoroutines();
        StartCoroutine(WaitAndSetCargo(isHaveGoods));
    }

    private void StopCarImmediately()
    {
        if (rb != null)
        {
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
            rb.Sleep();
        }

        foreach (WheelInfo wheel in wheelInfos)
        {
            if (wheel.collider != null)
            {
                wheel.collider.motorTorque = 0;
                wheel.collider.brakeTorque = 20000f;
            }
        }
    }

    private void ReleaseBrake()
    {
        foreach (WheelInfo wheel in wheelInfos)
        {
            if (wheel.collider != null)
            {
                wheel.collider.brakeTorque = 0;
            }
        }
    }

    private IEnumerator WaitAndSetCargo(bool shouldShow)
    {
        yield return new WaitForEndOfFrame();

        if (animator.GetCurrentAnimatorStateInfo(0).IsName("Idle"))
        {
            yield break;
        }

        CanController = false;

        AnimatorStateInfo stateInfo = animator.GetCurrentAnimatorStateInfo(0);
        float animationLength = stateInfo.length;

        yield return new WaitForSeconds(animationLength);

        if (cargoObject != null)
        {
            cargoObject.SetActive(shouldShow);
        }

        ReleaseBrake();
        CanController = true;
    }

    private void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("LoadingZone"))
        {
            if (!isHaveGoods)
                animator.SetBool(ResetParamId, false);
            isInLoadingZone = true;
        }
        else if (other.CompareTag("UnloadingZone"))
        {
            if (isHaveGoods)
                animator.SetBool(ResetParamId, false);
            isInUnloadingZone = true;
        }
    }

    private void OnTriggerExit(Collider other)
    {
        if (other.CompareTag("LoadingZone") || other.CompareTag("UnloadingZone"))
        {
            isInLoadingZone = false;
            isInUnloadingZone = false;
            ClickCount = 0;
            animator.SetBool(ResetParamId, true);

            if (!CanController)
            {
                StopAllCoroutines();
                CanController = true;
                if (cargoObject != null) cargoObject.SetActive(isHaveGoods);
            }
        }
    }

    public void ApplyLocalPositionToVisuals(WheelCollider collider, Transform visualMesh)
    {
        Vector3 pos;
        Quaternion rot;
        collider.GetWorldPose(out pos, out rot);
        visualMesh.position = pos;
        visualMesh.rotation = rot;
    }

    public void PulseRelay()
    {
        Debug.Log("IO_RELAY:PULSE");
    }
}